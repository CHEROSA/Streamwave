/**
 * Token Model
 * 
 * This model defines the structure and behavior of tokens in the system.
 * Used for blacklisting and refresh token storage.
 */

module.exports = (sequelize, DataTypes) => {
  const Token = sequelize.define('Token', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tokenId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    type: {
      type: DataTypes.ENUM('blacklisted', 'refresh'),
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'User',
        key: 'id'
      }
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false
    }
  }, {
    tableName: 'tokens',
    timestamps: true,
    indexes: [
      {
        fields: ['tokenId']
      },
      {
        fields: ['expiresAt']
      },
      {
        fields: ['userId', 'type']
      }
    ]
  });

  Token.associate = (models) => {
    Token.belongsTo(models.User, {
      foreignKey: 'userId',
      onDelete: 'CASCADE'
    });
  };

  return Token;
}; 