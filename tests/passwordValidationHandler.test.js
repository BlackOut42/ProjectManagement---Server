const { passwordValidation } = require('../src/util/passwordValidationHandler.js');

/*
  Password Requirements:
    at least 8 characters long.
    must contain an upper case letter.
    must contain a symbol.
*/

describe('passwordValidation', () => {
  test('should return false for passwords shorter than 8 characters', () => {
    for (let i = 0; i < 8; i++) {
      let password = 'A'.repeat(i);
      expect(passwordValidation(password)).toBe(false);
    }
  });

  test('should return false for passwords without an uppercase letter', () => {
    expect(passwordValidation('abcdefg!')).toBe(false);
    expect(passwordValidation('abcd123@')).toBe(false);
  });

  test('should return false for passwords without a symbol', () => {
    expect(passwordValidation('Abcdefgh')).toBe(false);
    expect(passwordValidation('Abcd1234')).toBe(false);
  });

  test('should return true for passwords that meet all criteria', () => {
    expect(passwordValidation('Abcdefgh!')).toBe(true);
    expect(passwordValidation('aabbccDd?')).toBe(true);
    expect(passwordValidation('Password123!')).toBe(true);
  });
});
