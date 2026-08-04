const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true
  },
  gstin: {
    type: String,
    required: [true, 'GSTIN is required'],
    unique: true,
    uppercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v);
      },
      message: props => `${props.value} is not a valid Indian GSTIN format!`
    }
  },
  pan: {
    type: String,
    required: [true, 'PAN is required'],
    unique: true,
    uppercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v);
      },
      message: props => `${props.value} is not a valid Indian PAN format!`
    }
  },
  address: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    trim: true
  },
  pincode: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^[1-9][0-9]{5}$/.test(v);
      },
      message: props => `${props.value} is not a valid Indian pincode!`
    }
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  logoUrl: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

const Company = mongoose.model('Company', companySchema);

module.exports = Company;
