use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

/// Integer piastres. 1 EGP = 100 piastres.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Money(pub i64);

impl Money {
    pub const SCALE: i64 = 100;

    pub fn piastres(self) -> i64 {
        self.0
    }

    pub fn checked_add(self, other: Self) -> AppResult<Self> {
        self.0
            .checked_add(other.0)
            .map(Self)
            .ok_or_else(|| AppError::user("تجاوز حساب المبلغ الحد المسموح."))
    }

    pub fn checked_sub(self, other: Self) -> AppResult<Self> {
        self.0
            .checked_sub(other.0)
            .map(Self)
            .ok_or_else(|| AppError::user("قيمة مالية غير صحيحة."))
    }

    pub fn checked_mul_qty(self, qty: i64) -> AppResult<Self> {
        self.0
            .checked_mul(qty)
            .map(Self)
            .ok_or_else(|| AppError::user("تجاوز حساب الكمية الحد المسموح."))
    }

    /// `bps` = basis points, 10000 = 100%.
    pub fn percent_bps(self, bps: i64) -> AppResult<Self> {
        let n = self
            .0
            .checked_mul(bps)
            .ok_or_else(|| AppError::user("تجاوز حساب النسبة الحد المسموح."))?;
        Ok(Self(div_round(n, 10_000)))
    }
}

pub fn div_round(n: i64, d: i64) -> i64 {
    if d == 0 {
        return 0;
    }
    if n >= 0 {
        (n + d / 2) / d
    } else {
        (n - d / 2) / d
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_rounds_half_up() {
        let m = Money(100);
        assert_eq!(m.percent_bps(500).unwrap().0, 5);
        let m = Money(1);
        assert_eq!(m.percent_bps(5000).unwrap().0, 1);
    }

    #[test]
    fn mul_qty() {
        assert_eq!(Money(250).checked_mul_qty(3).unwrap().0, 750);
    }
}
