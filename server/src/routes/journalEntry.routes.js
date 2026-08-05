const express = require('express');
const authenticate = require('../middleware/authenticate');
const checkCompanyAccess = require('../middleware/companyAccess');
const validateRequest = require('../middleware/validateRequest');
const { createJournalEntrySchema } = require('../validators/journalEntry.validators');
const journalEntryController = require('../controllers/journalEntry.controller');

const router = express.Router();

router.post('/', authenticate, validateRequest(createJournalEntrySchema), checkCompanyAccess, journalEntryController.createJournalEntry);
router.get('/', authenticate, checkCompanyAccess, journalEntryController.listJournalEntries);
router.get('/:id', authenticate, journalEntryController.getJournalEntry);
router.delete('/:id', authenticate, journalEntryController.reverseJournalEntry);

module.exports = router;
