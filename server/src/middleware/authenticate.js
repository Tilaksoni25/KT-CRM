const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');

/**
 * Express middleware to authenticate requests with JWT access token
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 * @param {import('express').NextFunction} next 
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is missing or invalid'
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Access token has expired or is invalid'
      });
    }

    // Retrieve user and check if they still exist
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed: User no longer exists'
      });
    }

    // Check if user account is locked
    if (user.isLocked) {
      return res.status(403).json({
        success: false,
        message: 'Authentication failed: Account is locked'
      });
    }

    // Attach user document to request object
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = authenticate;
