const jwt = require('jsonwebtoken');

try {
  const token = jwt.sign({ foo: 'bar' }, undefined);
  console.log("Signed with undefined. Token:", token);
  
  try {
    const decoded = jwt.verify(token, '');
    console.log("Verified with empty string. Decoded:", decoded);
  } catch (e) {
    console.log("Failed to verify with empty string:", e.message);
  }
} catch (e) {
  console.log("Failed to sign with undefined:", e.message);
}

try {
  const token2 = jwt.sign({ foo: 'bar' }, process.env.JWT_SECRET);
  console.log("Signed with process.env.JWT_SECRET (undefined):", token2);
} catch (e) {
  console.log("Failed to sign with process.env.JWT_SECRET:", e.message);
}
