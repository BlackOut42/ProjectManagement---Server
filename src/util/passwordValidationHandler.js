const passwordValidation = (str) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/;
  const hasSymbol = /[!@#$%^&*(),.?":{}|<>[\]\/\\`~;=_+|-]/;

  if (str.length < minLength) {
    return false;
  }
  if (!hasUpperCase.test(str)) {
    return false;
  }
  if (!hasSymbol.test(str)) {
    return false;
  }

  return true;
};

module.exports = { passwordValidation };
