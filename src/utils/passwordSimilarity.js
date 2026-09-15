function normalize(str = '') {
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function containsSubstantial(password, value, minLen = 3) {
  if (!value) return false;
  const normPassword = normalize(password);
  const normValue = normalize(value);
  if (normValue.length < minLen) return false;
  return normPassword.includes(normValue);
}

function isPasswordSimilarToUserInfo(password, userInfo = {}) {
  const { fullName, email, phoneNumber, username } = userInfo;
  const checks = [];

  if (fullName) {
    checks.push(fullName);
    fullName.split(/\s+/).forEach(part => checks.push(part));
  }
  if (email) {
    checks.push(email);
    checks.push(email.split('@')[0]);
  }
  if (phoneNumber) checks.push(phoneNumber);
  if (username) checks.push(username);

  return checks.some(value => containsSubstantial(password, value));
}

module.exports = { isPasswordSimilarToUserInfo };