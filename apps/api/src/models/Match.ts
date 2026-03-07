import mongoose, { Schema } from "mongoose";

const matchSchema = new Schema({
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  leftBotId: {
    type: Schema.Types.ObjectId,
    ref: "Bot",
    required: true
  },
  rightBotId: {
    type: Schema.Types.ObjectId,
    ref: "Bot",
    required: true
  },
  mapId: {
    type: String,
    required: true
  },
  winnerTankId: {
    type: String,
    default: null
  },
  reason: {
    type: String,
    required: true
  },
  totalTicks: {
    type: Number,
    required: true
  },
  replay: {
    type: [Schema.Types.Mixed],
    required: true
  },
  finalState: {
    type: Schema.Types.Mixed,
    required: true
  }
}, {
  timestamps: true
});

export type MatchDocument = mongoose.InferSchemaType<typeof matchSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const MatchModel = mongoose.models.Match ?? mongoose.model("Match", matchSchema);
