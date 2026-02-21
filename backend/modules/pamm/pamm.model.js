/**
 * PAMM model
 * Manager accounts, followers, allocation, performance fee
 */
const pammSchema = {
  id: 'uuid',
  managerId: 'uuid',
  name: 'string',
  allocationPercent: 'decimal',
  performanceFeePercent: 'decimal',
  cutoffWithdrawEnabled: 'boolean',
  createdAt: 'timestamp',
};

module.exports = { pammSchema };
