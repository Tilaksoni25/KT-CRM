const determineNextStep = (user) => {
  if (!user.companyCreated) return 'CREATE_COMPANY';
  if (!user.branchCreated) return 'CREATE_BRANCH';
  if (!user.financialYearCreated) return 'CREATE_FINANCIAL_YEAR';
  return 'DASHBOARD';
};

const shapeOnboardingUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  companyId: user.companyId || null,
  companyCreated: Boolean(user.companyCreated),
  branchCreated: Boolean(user.branchCreated),
  financialYearCreated: Boolean(user.financialYearCreated)
});

const buildUserOnboardingResponse = (user) => ({
  user: shapeOnboardingUser(user),
  nextStep: determineNextStep(user)
});

module.exports = {
  determineNextStep,
  shapeOnboardingUser,
  buildUserOnboardingResponse
};
