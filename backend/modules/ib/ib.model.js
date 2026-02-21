/**
 * Introducing Broker model
 * IB hierarchy, levels, commission structure
 */
const ibSchema = {
  id: 'uuid',
  userId: 'uuid',
  parentId: 'uuid',
  level: 'number',
  commissionRate: 'decimal',
  createdAt: 'timestamp',
};

module.exports = { ibSchema };
