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
