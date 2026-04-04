use crate::error::AppError;
use std::collections::HashSet;
use std::net::TcpListener;

pub struct PortAllocator {
    base_port: u16,
    max_port: u16,
    allocated: HashSet<u16>,
}

impl PortAllocator {
    pub fn new(base: u16, max: u16) -> Self {
        Self {
            base_port: base,
            max_port: max,
            allocated: HashSet::new(),
        }
    }

    /// Allocate the next available block of 10 ports.
    /// Returns the base port of the block.
    pub fn allocate(&mut self) -> Result<u16, AppError> {
        let mut candidate = self.base_port;
        while candidate + 10 <= self.max_port {
            if !self.allocated.contains(&candidate) && self.check_ports_free(candidate, 10) {
                self.allocated.insert(candidate);
                return Ok(candidate);
            }
            candidate += 10;
        }
        Err(AppError::PortExhausted)
    }

    pub fn release(&mut self, base: u16) {
        self.allocated.remove(&base);
    }

    fn check_ports_free(&self, base: u16, count: u16) -> bool {
        for port in base..base + count {
            if TcpListener::bind(("127.0.0.1", port)).is_err() {
                return false;
            }
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_sets_range() {
        let pa = PortAllocator::new(5000, 6000);
        assert_eq!(pa.base_port, 5000);
        assert_eq!(pa.max_port, 6000);
        assert!(pa.allocated.is_empty());
    }

    #[test]
    fn test_allocate_and_release() {
        let mut pa = PortAllocator::new(49100, 49200);
        let port = pa.allocate().unwrap();
        assert!(port >= 49100 && port < 49200);
        assert!(pa.allocated.contains(&port));
        pa.release(port);
        assert!(!pa.allocated.contains(&port));
    }

    #[test]
    fn test_allocate_increments_by_10() {
        let mut pa = PortAllocator::new(49200, 49300);
        let p1 = pa.allocate().unwrap();
        let p2 = pa.allocate().unwrap();
        assert!(
            p2 > p1 && (p2 - p1) % 10 == 0,
            "expected p2 ({p2}) to be a multiple of 10 above p1 ({p1})"
        );
    }

    #[test]
    fn test_allocate_exhaustion() {
        // Range only fits 1 block of 10
        let mut pa = PortAllocator::new(49300, 49310);
        pa.allocate().unwrap();
        let result = pa.allocate();
        assert!(result.is_err());
    }
}
