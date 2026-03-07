import mongoose, { Schema } from "mongoose";

const botSchema = new Schema({
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: "User"
  },
  name: {
    type: String,
    required: true
  },
  version: {
    type: String,
    required: true
  },
  author: {
    type: String
  },
  definition: {
    type: Schema.Types.Mixed,
    required: true
  },
  isSystem: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

export type BotDocument = mongoose.InferSchemaType<typeof botSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const BotModel = mongoose.models.Bot ?? mongoose.model("Bot", botSchema);
