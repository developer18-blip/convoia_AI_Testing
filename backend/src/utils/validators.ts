// Email validation
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Password validation - minimum 8 characters, at least one number and one special character
export const isValidPassword = (password: string): boolean => {
  const passwordRegex = /^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{8,}$/;
  return passwordRegex.test(password);
};

// UUID validation
export const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// API Key validation — matches cvai_ prefix + 64 hex chars
export const isValidAPIKey = (key: string): boolean => {
  return /^cvai_[a-f0-9]{64}$/.test(key);
};

// Organization name validation
export const isValidOrganizationName = (name: string): boolean => {
  return name.length >= 2 && name.length <= 100;
};

// User name validation
export const isValidUserName = (name: string): boolean => {
  return name.length >= 2 && name.length <= 50;
};
