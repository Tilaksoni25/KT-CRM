const service = require('../services/payment.service');

const send = (handler) => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };

exports.receive = send(async (req, res) => res.status(201).json({ success: true, data: await service.createPayment(req.body, req.user._id) }));
exports.list = send(async (req, res) => { const { companyId, ...query } = req.query; const result = await service.listPayments(companyId, query); res.json({ success: true, data: { companyId, ...result } }); });
exports.get = send(async (req, res) => res.json({ success: true, data: service.shape(await service.getPayment(req.params.id), true) }));
