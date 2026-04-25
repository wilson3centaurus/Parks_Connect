const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');

const userModel = require('../models/userModel');
const otpModel = require('../models/otpModel');
const { sendMail } = require('../config/mailer');
const { logActivity } = require('../middleware/logger');

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/;
const STAFF_ROLES = ['admin', 'ranger', 'tourism_officer', 'analyst'];

function clean(value) {
  return String(value || '').trim().replace(/[<>]/g, '');
}

function getAdminKey() {
  return process.env.ADMIN_REG_KEY || process.env.IT_ADMIN_KEY || '';
}

function mapErrors(req) {
  return validationResult(req).array().map((error) => ({
    field: error.path,
    msg: error.msg
  }));
}

function buildRegistrationFormData(body) {
  return {
    firstName: clean(body.firstName),
    surname: clean(body.surname),
    email: clean(body.email).toLowerCase(),
    phone: clean(body.phone),
    role: clean(body.role),
    adminRegistrationKey: clean(body.adminRegistrationKey),
    password: body.password || '',
    confirmPassword: body.confirmPassword || ''
  };
}

function buildResetFormData(body) {
  return {
    email: clean(body.email).toLowerCase(),
    adminKey: clean(body.adminKey),
    password: body.password || '',
    confirmPassword: body.confirmPassword || ''
  };
}

function renderLogin(res, options = {}) {
  return res.status(options.status || 200).render('login', {
    title: 'Login',
    errors: options.errors || [],
    formData: options.formData || {},
    successMessage: options.successMessage || '',
    message: options.message || ''
  });
}

function renderCreateAccount(res, options = {}) {
  return res.status(options.status || 200).render('create-account', {
    title: 'Create Account',
    errors: options.errors || [],
    formData: options.formData || {},
    otpSent: options.otpSent || false,
    otpVerified: options.otpVerified || false,
    otpMessage: options.otpMessage || '',
    otpError: options.otpError || false
  });
}

function renderForgotPassword(res, options = {}) {
  return res.status(options.status || 200).render('forgot-password', {
    title: 'Forgot Password',
    errors: options.errors || [],
    formData: options.formData || {},
    otpSent: options.otpSent || false,
    otpVerified: options.otpVerified || false,
    otpMessage: options.otpMessage || '',
    otpError: options.otpError || false,
    successMessage: options.successMessage || ''
  });
}

function validateRegistrationData(formData) {
  const errors = [];

  if (!PASSWORD_REGEX.test(formData.password)) {
    errors.push({ field: 'password', msg: 'Password must be at least 8 characters and include an uppercase letter, a number, and a special character.' });
  }

  if (formData.password !== formData.confirmPassword) {
    errors.push({ field: 'confirmPassword', msg: 'Passwords do not match.' });
  }

  if (STAFF_ROLES.includes(formData.role) && formData.adminRegistrationKey !== getAdminKey()) {
    errors.push({ field: 'adminRegistrationKey', msg: 'Invalid admin registration key.' });
  }

  return errors;
}

function validateResetData(formData) {
  const errors = [];

  if (formData.adminKey !== getAdminKey()) {
    errors.push({ field: 'adminKey', msg: 'Invalid admin key.' });
  }

  if (!PASSWORD_REGEX.test(formData.password)) {
    errors.push({ field: 'password', msg: 'Password must be at least 8 characters and include an uppercase letter, a number, and a special character.' });
  }

  if (formData.password !== formData.confirmPassword) {
    errors.push({ field: 'confirmPassword', msg: 'Passwords do not match.' });
  }

  return errors;
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function buildOtpExpiry() {
  return new Date(Date.now() + 10 * 60 * 1000);
}

exports.renderLogin = (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  return renderLogin(res);
};

exports.login = async (req, res, next) => {
  try {
    const formData = {
      email: clean(req.body.email).toLowerCase(),
      password: req.body.password || ''
    };

    const errors = mapErrors(req);
    if (errors.length) {
      return renderLogin(res, { status: 422, errors, formData });
    }

    const user = await userModel.findByEmail(formData.email);
    if (!user) {
      return renderLogin(res, { status: 401, errors: [{ field: 'email', msg: 'Invalid email or password.' }], formData });
    }

    if (!user.is_active) {
      return renderLogin(res, { status: 403, errors: [{ field: 'email', msg: 'This account is inactive. Contact an administrator.' }], formData });
    }

    if (user.role === 'public') {
      return renderLogin(res, { status: 403, errors: [{ field: 'email', msg: 'Public users do not need login access. Submit feedback directly instead.' }], formData });
    }

    const passwordMatches = await bcrypt.compare(formData.password, user.password);
    if (!passwordMatches) {
      return renderLogin(res, { status: 401, errors: [{ field: 'email', msg: 'Invalid email or password.' }], formData });
    }

    req.session.user = {
      id: user.id,
      firstName: user.first_name,
      surname: user.surname,
      email: user.email,
      role: user.role
    };

    await logActivity(user.id, 'login', 'auth', `User ${user.email} logged in.`, req);
    return req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);
      return res.redirect('/dashboard');
    });
  } catch (error) {
    return next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const activeUser = req.session.user;
    if (activeUser) {
      await logActivity(activeUser.id, 'logout', 'auth', `User ${activeUser.email} logged out.`, req);
    }

    req.session.destroy((error) => {
      if (error) {
        return next(error);
      }

      res.clearCookie('zimparks.sid');
      return res.redirect('/login');
    });
  } catch (error) {
    return next(error);
  }
};

exports.renderCreateAccount = (req, res) => {
  const pending = req.session.pendingRegistration || {};
  const otpVerified = Boolean(req.session.registerOtpVerified && req.session.registerOtpVerified.email === pending.email);
  return renderCreateAccount(res, {
    formData: {
      ...pending,
      password: pending._password || '',
      confirmPassword: pending._password || ''
    },
    otpSent: Boolean(req.session.registrationOtpSent),
    otpVerified
  });
};

exports.sendRegistrationOtp = async (req, res, next) => {
  try {
    const formData = buildRegistrationFormData(req.body);
    const errors = [...mapErrors(req), ...validateRegistrationData(formData)];

    const existingUser = formData.email ? await userModel.findByEmail(formData.email) : null;
    if (existingUser) {
      errors.push({ field: 'email', msg: 'An account already exists for this email address.' });
    }

    if (errors.length) {
      return renderCreateAccount(res, {
        status: 422,
        errors,
        formData,
        otpSent: false,
        otpVerified: false
      });
    }

    const otpCode = generateOtpCode();
    await otpModel.createOtp(formData.email, 'register', otpCode, buildOtpExpiry());

    req.session.pendingRegistration = {
      firstName: formData.firstName,
      surname: formData.surname,
      email: formData.email,
      phone: formData.phone,
      role: formData.role,
      _password: formData.password
    };
    req.session.registrationOtpSent = true;
    delete req.session.registerOtpVerified;

    await sendMail({
      to: formData.email,
      subject: 'Your ZimParks registration OTP',
      text: `Your OTP is ${otpCode}. It expires in 10 minutes.`,
      html: `<p>Your OTP is <strong>${otpCode}</strong>. It expires in 10 minutes.</p>`
    });

    await logActivity(null, 'otp_sent', 'auth', `Registration OTP sent to ${formData.email}.`, req);

    return renderCreateAccount(res, {
      formData,
      otpSent: true,
      otpVerified: false,
      otpMessage: 'OTP sent successfully. Check your email to continue.',
      otpError: false
    });
  } catch (error) {
    return next(error);
  }
};

exports.verifyAndRegister = async (req, res, next) => {
  try {
    const pending = req.session.pendingRegistration || {};
    const formData = buildRegistrationFormData(req.body);
    const otpCode = clean(req.body.otp);

    // Use password from form body; fall back to session if field was somehow empty
    if (!formData.password && pending._password) {
      formData.password = pending._password;
      formData.confirmPassword = pending._password;
    }

    if (!pending.email || pending.email !== formData.email) {
      return renderCreateAccount(res, {
        status: 422,
        errors: [{ field: 'otp', msg: 'Registration session expired. Please send a new OTP.' }],
        formData,
        otpSent: false,
        otpVerified: false,
        otpError: true
      });
    }

    const otpRecord = await otpModel.findValidOtp(formData.email, 'register', otpCode);
    if (!otpRecord) {
      return renderCreateAccount(res, {
        status: 422,
        formData,
        otpSent: true,
        otpVerified: false,
        otpMessage: 'Invalid or expired OTP. Account was not registered.',
        otpError: true
      });
    }

    const errors = [...mapErrors(req), ...validateRegistrationData(formData)];
    const existingUser = formData.email ? await userModel.findByEmail(formData.email) : null;
    if (existingUser) {
      errors.push({ field: 'email', msg: 'An account already exists for this email address.' });
    }

    if (errors.length) {
      return renderCreateAccount(res, {
        status: 422,
        errors,
        formData,
        otpSent: true,
        otpVerified: false,
        otpError: true
      });
    }

    await otpModel.consumeOtp(otpRecord.id);

    const hashedPassword = await bcrypt.hash(formData.password, 12);
    const userId = await userModel.createUser({
      firstName: formData.firstName,
      surname: formData.surname,
      email: formData.email,
      phone: formData.phone,
      role: formData.role,
      password: hashedPassword
    });

    await logActivity(userId, 'register', 'auth', `New ${formData.role} account registered for ${formData.email}.`, req);

    delete req.session.pendingRegistration;
    delete req.session.registrationOtpSent;
    delete req.session.registerOtpVerified;

    if (formData.role === 'public') {
      return renderLogin(res, { successMessage: 'Account created successfully. Sign in to continue.' });
    }

    req.session.user = {
      id: userId,
      firstName: formData.firstName,
      surname: formData.surname,
      email: formData.email,
      role: formData.role
    };

    return req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);
      return res.redirect('/dashboard');
    });
  } catch (error) {
    return next(error);
  }
};

exports.register = async (req, res, next) => {
  try {
    const formData = buildRegistrationFormData(req.body);
    const otpVerified = req.session.registerOtpVerified;

    if (!otpVerified || otpVerified.email !== formData.email) {
      return renderCreateAccount(res, {
        status: 403,
        errors: [{ field: 'otp', msg: 'OTP verification is required before account registration.' }],
        formData,
        otpSent: Boolean(req.session.registrationOtpSent),
        otpVerified: false,
        otpMessage: 'Verify the OTP before registering.',
        otpError: true
      });
    }

    const errors = [...mapErrors(req), ...validateRegistrationData(formData)];
    const existingUser = formData.email ? await userModel.findByEmail(formData.email) : null;
    if (existingUser) {
      errors.push({ field: 'email', msg: 'An account already exists for this email address.' });
    }

    if (errors.length) {
      return renderCreateAccount(res, {
        status: 422,
        errors,
        formData,
        otpSent: true,
        otpVerified: true
      });
    }

    const hashedPassword = await bcrypt.hash(formData.password, 12);
    const userId = await userModel.createUser({
      firstName: formData.firstName,
      surname: formData.surname,
      email: formData.email,
      phone: formData.phone,
      role: formData.role,
      password: hashedPassword
    });

    await logActivity(userId, 'register', 'auth', `New ${formData.role} account registered for ${formData.email}.`, req);

    delete req.session.pendingRegistration;
    delete req.session.registrationOtpSent;
    delete req.session.registerOtpVerified;

    return renderLogin(res, {
      successMessage: 'Account created successfully. Sign in to continue.'
    });
  } catch (error) {
    return next(error);
  }
};

exports.renderForgotPassword = (req, res) => {
  const pending = req.session.pendingPasswordReset || {};
  const otpVerified = Boolean(req.session.resetOtpVerified && req.session.resetOtpVerified.email === pending.email);
  return renderForgotPassword(res, {
    formData: pending,
    otpSent: Boolean(req.session.resetOtpSent),
    otpVerified
  });
};

exports.sendResetOtp = async (req, res, next) => {
  try {
    const formData = buildResetFormData(req.body);
    const errors = [...mapErrors(req), ...validateResetData(formData)];
    const user = formData.email ? await userModel.findByEmail(formData.email) : null;

    if (!user) {
      errors.push({ field: 'email', msg: 'No account was found for this email address.' });
    }

    if (errors.length) {
      return renderForgotPassword(res, {
        status: 422,
        errors,
        formData,
        otpSent: false,
        otpVerified: false
      });
    }

    const otpCode = generateOtpCode();
    await otpModel.createOtp(formData.email, 'forgot_password', otpCode, buildOtpExpiry());

    req.session.pendingPasswordReset = { email: formData.email };
    req.session.resetOtpSent = true;
    delete req.session.resetOtpVerified;

    await sendMail({
      to: formData.email,
      subject: 'Your ZimParks password reset OTP',
      text: `Your password reset OTP is ${otpCode}. It expires in 10 minutes.`,
      html: `<p>Your password reset OTP is <strong>${otpCode}</strong>. It expires in 10 minutes.</p>`
    });

    await logActivity(null, 'otp_sent', 'auth', `Password reset OTP sent to ${formData.email}.`, req);

    return renderForgotPassword(res, {
      formData,
      otpSent: true,
      otpVerified: false,
      otpMessage: 'Reset OTP sent successfully. Check your email.',
      otpError: false
    });
  } catch (error) {
    return next(error);
  }
};

exports.verifyResetOtp = async (req, res, next) => {
  try {
    const pending = req.session.pendingPasswordReset || {};
    const formData = {
      ...pending,
      email: clean(req.body.email || pending.email).toLowerCase()
    };

    const errors = mapErrors(req);
    if (!pending.email || pending.email !== formData.email) {
      errors.push({ field: 'email', msg: 'Reset details are missing. Send a new OTP.' });
    }

    if (errors.length) {
      return renderForgotPassword(res, {
        status: 422,
        errors,
        formData,
        otpSent: true,
        otpVerified: false,
        otpMessage: 'Unable to verify reset OTP.',
        otpError: true
      });
    }

    const otpRecord = await otpModel.findValidOtp(formData.email, 'forgot_password', clean(req.body.otp));
    if (!otpRecord) {
      return renderForgotPassword(res, {
        status: 422,
        formData,
        otpSent: true,
        otpVerified: false,
        otpMessage: 'The OTP is invalid, expired, or already used.',
        otpError: true
      });
    }

    await otpModel.consumeOtp(otpRecord.id);
    req.session.resetOtpVerified = {
      email: formData.email,
      verifiedAt: Date.now()
    };

    await logActivity(null, 'otp_verified', 'auth', `Password reset OTP verified for ${formData.email}.`, req);

    return renderForgotPassword(res, {
      formData,
      otpSent: true,
      otpVerified: true,
      otpMessage: 'OTP verified. You can now reset the password.',
      otpError: false
    });
  } catch (error) {
    return next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const formData = buildResetFormData(req.body);
    const otpVerified = req.session.resetOtpVerified;

    if (!otpVerified || otpVerified.email !== formData.email) {
      return renderForgotPassword(res, {
        status: 403,
        errors: [{ field: 'otp', msg: 'Reset OTP verification is required before changing the password.' }],
        formData,
        otpSent: Boolean(req.session.resetOtpSent),
        otpVerified: false,
        otpMessage: 'Verify the reset OTP before submitting the new password.',
        otpError: true
      });
    }

    const errors = [...mapErrors(req), ...validateResetData(formData)];
    const user = formData.email ? await userModel.findByEmail(formData.email) : null;

    if (!user) {
      errors.push({ field: 'email', msg: 'No account was found for this email address.' });
    }

    if (errors.length) {
      return renderForgotPassword(res, {
        status: 422,
        errors,
        formData,
        otpSent: true,
        otpVerified: true
      });
    }

    const hashedPassword = await bcrypt.hash(formData.password, 12);
    const db = require('../config/db');
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id]);

    await logActivity(user.id, 'password_reset', 'auth', `Password reset completed for ${formData.email}.`, req);

    delete req.session.pendingPasswordReset;
    delete req.session.resetOtpSent;
    delete req.session.resetOtpVerified;

    req.session.user = {
      id: user.id,
      firstName: user.first_name,
      surname: user.surname,
      email: user.email,
      role: user.role
    };

    return req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);
      return res.redirect('/dashboard');
    });
  } catch (error) {
    return next(error);
  }
};
