# Task List - Module 25 (GST & Tax Master)

- [x] Create `Tax.js` model with unique constraint & case-insensitive name index
- [x] Create `gst.service.js` implementing checksum calculation, returns summary & seeding
- [x] Integrate `gst.service.js`'s `validateGstin` into `customer.service.js`
- [x] Create Zod schemas for tax creation, seeding, and GSTIN validation
- [x] Implement Tax & GST controllers
- [x] Set up Express routes for Tax & GST
- [x] Mount Tax & GST routers in `app.js`
- [x] Create integration tests in `gst.test.js` covering seeding, duplicate names, valid/invalid checksums, format validation, and returns summary
- [x] Create `gst_endpoints.http` REST client file for manual verification
- [x] Verify all 137 tests pass successfully
- [x] Document Module 25 in `README.md`
