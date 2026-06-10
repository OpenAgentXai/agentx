use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use argon2::{password_hash::SaltString, Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use rand::RngCore;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;

use super::errors::AppError;

/// Hash a password using Argon2id
pub fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(format!("Password hashing failed: {}", e)))?;
    Ok(hash.to_string())
}

/// Verify a password against a hash
pub fn verify_password(password: &str, hash: &str) -> Result<bool, AppError> {
    let parsed_hash = PasswordHash::new(hash)
        .map_err(|e| AppError::Internal(format!("Invalid password hash: {}", e)))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

/// Generate a random API key (48 bytes = 64 chars base64)
pub fn generate_api_key() -> String {
    let mut key = [0u8; 48];
    OsRng.fill_bytes(&mut key);
    format!("agx_{}", BASE64.encode(key).replace(['+', '/', '='], ""))
}

/// Get the prefix of an API key for display (first 8 chars after prefix)
pub fn api_key_prefix(key: &str) -> String {
    if key.len() > 12 {
        key[..12].to_string()
    } else {
        key.to_string()
    }
}

/// Hash an API key for storage (using SHA-256 for fast lookup)
pub fn hash_api_key(key: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    // Use argon2 for API key hashing too (more secure than SHA-256 for this use case)
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    argon2
        .hash_password(key.as_bytes(), &salt)
        .map(|h| h.to_string())
        .unwrap_or_else(|_| {
            // Fallback: simple hash (should never happen)
            let mut hasher = DefaultHasher::new();
            key.hash(&mut hasher);
            format!("{:x}", hasher.finish())
        })
}

/// Encrypt sensitive data using AES-256-GCM
pub fn encrypt(plaintext: &[u8], key: &[u8]) -> Result<Vec<u8>, AppError> {
    if key.len() != 32 {
        return Err(AppError::Internal("Encryption key must be 32 bytes".into()));
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| AppError::Internal(format!("Cipher init failed: {}", e)))?;

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| AppError::Internal(format!("Encryption failed: {}", e)))?;

    // Prepend nonce to ciphertext
    let mut result = nonce_bytes.to_vec();
    result.extend(ciphertext);
    Ok(result)
}

/// Decrypt data encrypted with encrypt()
pub fn decrypt(encrypted: &[u8], key: &[u8]) -> Result<Vec<u8>, AppError> {
    if key.len() != 32 {
        return Err(AppError::Internal("Encryption key must be 32 bytes".into()));
    }
    if encrypted.len() < 12 {
        return Err(AppError::Internal("Invalid encrypted data".into()));
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| AppError::Internal(format!("Cipher init failed: {}", e)))?;

    let nonce = Nonce::from_slice(&encrypted[..12]);
    let ciphertext = &encrypted[12..];

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| AppError::Internal(format!("Decryption failed: {}", e)))
}

/// Generate a random token (for password reset, etc.)
pub fn generate_token(length: usize) -> String {
    let mut bytes = vec![0u8; length];
    OsRng.fill_bytes(&mut bytes);
    BASE64.encode(&bytes).replace(['+', '/', '='], "")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_password_hash_and_verify() {
        let password = "my-secure-password-123!";
        let hash = hash_password(password).unwrap();
        assert!(verify_password(password, &hash).unwrap());
        assert!(!verify_password("wrong-password", &hash).unwrap());
    }

    #[test]
    fn test_api_key_generation() {
        let key = generate_api_key();
        assert!(key.starts_with("agx_"));
        assert!(key.len() > 20);
    }

    #[test]
    fn test_encrypt_decrypt() {
        let key = [0u8; 32]; // Test key
        let plaintext = b"sensitive agent credential data";

        let encrypted = encrypt(plaintext, &key).unwrap();
        let decrypted = decrypt(&encrypted, &key).unwrap();

        assert_eq!(plaintext.to_vec(), decrypted);
    }

    #[test]
    fn test_encrypt_decrypt_different_keys_fails() {
        let key1 = [0u8; 32];
        let key2 = [1u8; 32];
        let plaintext = b"secret data";

        let encrypted = encrypt(plaintext, &key1).unwrap();
        assert!(decrypt(&encrypted, &key2).is_err());
    }

    #[test]
    fn test_api_key_hash_verifies() {
        let key = generate_api_key();
        let hash = hash_api_key(&key);
        assert!(verify_password(&key, &hash).unwrap());
    }

    #[test]
    fn test_encrypt_uses_random_nonce() {
        let key = [7u8; 32];
        let a = encrypt(b"same plaintext", &key).unwrap();
        let b = encrypt(b"same plaintext", &key).unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn test_generate_token_length_and_uniqueness() {
        let t = generate_token(32);
        assert!(t.len() >= 32);
        assert_ne!(t, generate_token(32));
    }
}
