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
