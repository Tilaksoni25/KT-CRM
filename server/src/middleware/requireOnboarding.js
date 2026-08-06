const { determineNextStep } = require('../utils/onboarding');

const requireOnboarding = (req, res, next) => {
  const user = req.user;

  if (!user.companyCreated || !user.branchCreated || !user.financialYearCreated) {
    return res.status(403).json({
      success: false,
      message: 'Complete onboarding first.',
      nextStep: determineNextStep(user)
    });
  }

  next();
};

module.exports = requireOnboarding;
