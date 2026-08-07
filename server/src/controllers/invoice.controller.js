const service = require('../services/invoice.service');
const send = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
exports.create = send(async (req, res) => res.status(201).json({ success: true, data: await service.createInvoice(req.body, req.user._id) }));
exports.list = send(async (req, res) => {
  const { companyId, ...query } = req.query;
  const result = await service.listInvoices(companyId, query);
  res.json({ success: true, data: { companyId, ...result } });
});
exports.get = send(async (req, res) => {
  const invoice = await service.getInvoice(req.params.id);
  res.json({ success: true, data: service.shape(invoice, true) });
});
exports.update = send(async (req, res) => {
  const invoice = await service.getInvoiceDocument(req.params.id);
  res.json({ success: true, data: await service.updateInvoice(invoice, req.body, req.user._id) });
});
exports.cancel = send(async (req, res) => {
  const invoice = await service.getInvoiceDocument(req.params.id);
  res.json({ success: true, data: await service.cancelInvoice(invoice, req.user._id) });
});
exports.pdf = send(async (req, res) => {
  const invoice = await service.getInvoice(req.params.id);
  res.json({ success: true, data: { id: invoice._id.toString(), downloadUrl: null, note: 'Placeholder — PDF generation/export to be wired to document service later.' } });
});
