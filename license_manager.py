import hashlib
import hmac
import json
import os
import sys
import uuid
from calendar import monthrange
from datetime import datetime, date, timedelta
from pathlib import Path

PROGRAM_ID = "4394bd0a"
_EMBEDDED_HMAC_SECRET_HEX = '4fc09b5b779b79e08613e192e391027dfdada32f3911e43ac2afcba9efa8d895'
ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
TRIAL_MONTHS = 4
LICENSE_FILE = 'license.dat'
TRIAL_FILE = '.trial_info'


def _get_exe_dir():
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent


def _get_data_dir():
    return _get_exe_dir()


def _get_hmac_secret():
    key_file = _get_exe_dir() / 'hmac_secret.key'
    if key_file.exists():
        data = key_file.read_bytes().strip()
        if len(data) == 32:
            return data
        return bytes.fromhex(data.decode('ascii'))
    return bytes.fromhex(_EMBEDDED_HMAC_SECRET_HEX)


def get_machine_id():
    node = uuid.getnode()
    return f'{node:012X}'


def _build_payload(program_id, machine_id, expiry_str):
    machine_hash = hashlib.sha256(machine_id.encode()).hexdigest()
    return f'{program_id}|{machine_hash}|{expiry_str}'.encode('utf-8')


def _decode_expiry(days_val):
    epoch = date(2024, 1, 1)
    return epoch + timedelta(days=days_val)


def _key_decode(key_str):
    clean = key_str.replace('-', '').upper()
    if len(clean) != 16:
        raise ValueError(f'Expected 16 characters, got {len(clean)}')
    base = len(ALPHABET)
    num = 0
    for ch in clean:
        idx = ALPHABET.index(ch)
        num = num * base + idx
    raw = num.to_bytes(8, 'big')
    expiry_days = int.from_bytes(raw[:2], 'big')
    tag = raw[2:]
    return expiry_days, tag


def verify_short_license(license_key, machine_id=None):
    try:
        key = license_key.strip()
        if len(key.replace('-', '')) != 16:
            return False, 'صيغة المفتاح غير صحيحة'
        try:
            expiry_days, input_tag = _key_decode(key)
            expiry_date = _decode_expiry(expiry_days)
            expiry_str = expiry_date.strftime('%Y-%m-%d')
        except (ValueError, IndexError) as e:
            return False, f'خطأ في فك المفتاح: {e}'
        if machine_id is None:
            machine_id = get_machine_id()
        secret = _get_hmac_secret()
        payload = _build_payload(PROGRAM_ID, machine_id, expiry_str)
        expected_tag = hmac.new(secret, payload, hashlib.sha256).digest()[:6]
        if not hmac.compare_digest(input_tag, expected_tag):
            return False, 'المفتاح غير صالح لهذا الجهاز'
        now = datetime.now()
        if now.date() > expiry_date:
            return False, 'المفتاح منتهي الصلاحية'
        days_remaining = (expiry_date - now.date()).days
        return True, {
            'expiry': expiry_str,
            'days_remaining': days_remaining,
            'machine_id': machine_id,
        }
    except Exception as e:
        return False, f'خطأ في التحقق: {e}'


def validate_license_data(license_text):
    return verify_short_license(license_text)


def save_license(text):
    path = _get_data_dir() / LICENSE_FILE
    path.write_text(text.strip(), encoding='utf-8')


def load_saved_license():
    path = _get_data_dir() / LICENSE_FILE
    if path.exists():
        return path.read_text(encoding='utf-8').strip()
    return None


def load_license():
    return load_saved_license() or ""


def _init_trial():
    path = _get_data_dir() / TRIAL_FILE
    if path.exists():
        return
    data = {
        'start_date': datetime.now().strftime('%Y-%m-%d'),
        'machine_id': get_machine_id(),
    }
    path.write_text(json.dumps(data), encoding='utf-8')


def _get_trial_info():
    path = _get_data_dir() / TRIAL_FILE
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return None


def _add_months(d, months):
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, monthrange(year, month)[1])
    return date(year, month, day)


def get_trial_status():
    _init_trial()
    info = _get_trial_info()
    if not info:
        return {'active': False, 'days_remaining': 0}
    try:
        start = datetime.strptime(info['start_date'], '%Y-%m-%d').date()
        remaining = max(0, (_add_months(start, TRIAL_MONTHS) - datetime.now().date()).days)
        return {
            'active': remaining > 0,
            'days_remaining': remaining,
            'start_date': info['start_date'],
            'machine_id': info.get('machine_id', get_machine_id()),
        }
    except Exception:
        return {'active': False, 'days_remaining': 0}


def check_trial():
    status = get_trial_status()
    return status['days_remaining']


def is_licensed():
    key = load_saved_license()
    if key:
        mid = get_machine_id()
        valid, info = verify_short_license(key, mid)
        if valid:
            return True, f"مرخّص حتى {info['expiry']}"
    trial_days = check_trial()
    if trial_days > 0:
        return True, f"فترة تجريبية: {trial_days} يوم متبقي"
    return False, "غير مرخّص"


def check_license():
    machine_id = get_machine_id()
    saved = load_saved_license()
    if saved:
        valid, result = verify_short_license(saved, machine_id)
        if valid:
            return {
                'status': 'licensed',
                'machine_id': machine_id,
                'days_remaining': result['days_remaining'],
                'expiry': result['expiry'],
                'message': f'مُرخّص — ينتهي في {result["expiry"]}',
                'license_key': saved,
            }
    trial = get_trial_status()
    if trial['active']:
        return {
            'status': 'trial',
            'machine_id': machine_id,
            'days_remaining': trial['days_remaining'],
            'expiry': None,
            'message': f'فترة تجريبية — متبقي {trial["days_remaining"]} يوم',
        }
    return {
        'status': 'expired',
        'machine_id': machine_id,
        'days_remaining': 0,
        'expiry': None,
        'message': 'انتهت الفترة التجريبية — يرجى تفعيل الترخيص',
    }


def get_license_info():
    mid = get_machine_id()
    result = {
        'machine_id': mid,
        'is_licensed': False,
        'is_trial': False,
        'trial_days': 0,
        'expiry_date': None,
        'license_key': load_saved_license() or '',
        'status_message': '',
    }
    key = load_saved_license()
    if key:
        valid, info = verify_short_license(key, mid)
        if valid:
            result['is_licensed'] = True
            result['expiry_date'] = info['expiry']
            result['status_message'] = f"مرخّص حتى {info['expiry']}"
            return result
    trial_days = check_trial()
    if trial_days > 0:
        result['is_trial'] = True
        result['trial_days'] = trial_days
        result['status_message'] = f"فترة تجريبية: {trial_days} يوم متبقي"
    else:
        result['status_message'] = "غير مرخّص - انتهت الفترة التجريبية"
    return result
