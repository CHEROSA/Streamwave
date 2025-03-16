const { Model, DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

class User extends Model {
  static init(sequelize) {
    return super.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      streamKey: {
        type: DataTypes.STRING,
        unique: true,
      },
      isVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      role: {
        type: DataTypes.ENUM('user', 'admin'),
        defaultValue: 'user',
      },
      verificationToken: {
        type: DataTypes.STRING,
      },
      resetPasswordToken: {
        type: DataTypes.STRING,
      },
      resetPasswordExpires: {
        type: DataTypes.DATE,
      },
      wallet: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      pendingEarnings: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      availableEarnings: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
    }, {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      timestamps: true,
      hooks: {
        beforeCreate: async (user) => {
          if (user.password) {
            user.password = await bcrypt.hash(user.password, 10);
          }
          if (!user.streamKey) {
            user.streamKey = crypto.randomBytes(32).toString('hex');
          }
        },
        beforeUpdate: async (user) => {
          if (user.changed('password')) {
            user.password = await bcrypt.hash(user.password, 10);
          }
        },
      },
    });
  }

  static associate(models) {
    this.hasMany(models.Stream, {
      foreignKey: 'userId',
      as: 'streams',
    });
    this.hasMany(models.ChatMessage, {
      foreignKey: 'userId',
      as: 'messages',
    });
  }

  async comparePassword(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
  }

  generateStreamKey() {
    this.streamKey = crypto.randomBytes(32).toString('hex');
    return this.streamKey;
  }

  addCoinsToWallet(amount) {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    this.wallet += amount;
  }

  removeCoinsFromWallet(amount) {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    if (amount > this.wallet) {
      throw new Error('Insufficient coins in wallet');
    }
    this.wallet -= amount;
  }

  addPendingEarnings(amount) {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    this.pendingEarnings += amount;
  }

  addAvailableEarnings(amount) {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    this.availableEarnings += amount;
  }

  processPendingEarnings(amount) {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    if (amount > this.pendingEarnings) {
      throw new Error('Amount exceeds pending earnings');
    }
    this.pendingEarnings -= amount;
    this.availableEarnings += amount;
  }

  processPayout(amount) {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    if (amount > this.availableEarnings) {
      throw new Error('Amount exceeds available earnings');
    }
    this.availableEarnings -= amount;
  }

  generatePasswordResetToken() {
    this.resetPasswordToken = crypto.randomBytes(32).toString('hex');
    this.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    return this.resetPasswordToken;
  }

  generateVerificationToken() {
    this.verificationToken = crypto.randomBytes(32).toString('hex');
    return this.verificationToken;
  }
}

module.exports = User; 