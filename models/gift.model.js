/**
 * Gift Model
 * 
 * This model defines the structure and behavior of gifts in the system.
 */

module.exports = (sequelize, DataTypes) => {
  const Gift = sequelize.define('Gift', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    iconUrl: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    animationUrl: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    coins: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    specialEffects: {
      type: DataTypes.JSON,
      allowNull: true
    }
  }, {
    tableName: 'gifts',
    timestamps: true,
    indexes: [
      {
        fields: ['category']
      },
      {
        fields: ['isActive']
      },
      {
        fields: ['sortOrder']
      }
    ]
  });

  Gift.associate = (models) => {
    // Add any associations here if needed
    // For example:
    // Gift.belongsTo(models.User, { foreignKey: 'userId' });
  };

  return Gift;
};
