const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Company ID is required'],
    index: true
  },
  branchName: {
    type: String,
    required: [true, 'Branch name is required'],
    trim: true
  },
  branchCode: {
    type: String,
    trim: true,
    default: ''
  },
  address: {
    type: String,
    trim: true,
    default: ''
  },
  city: {
    type: String,
    trim: true,
    default: ''
  },
  state: {
    type: String,
    trim: true,
    default: ''
  },
  pincode: {
    type: String,
    trim: true,
    default: '',
    validate: {
      validator: function(v) {
        return !v || /^[1-9][0-9]{5}$/.test(v);
      },
      message: props => `${props.value} is not a valid Indian pincode!`
    }
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  manager: {
    type: String,
    trim: true,
    default: ''
  },
  isHeadOffice: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
});

const Branch = mongoose.model('Branch', branchSchema);

module.exports = Branch;
