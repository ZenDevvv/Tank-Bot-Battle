import mongoose, { Schema } from "mongoose";

const mapSchema = new Schema({
  mapId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  width: {
    type: Number,
    required: true
  },
  height: {
    type: Number,
    required: true
  },
  spawnPoints: {
    type: [Schema.Types.Mixed],
    required: true
  },
  walls: {
    type: [Schema.Types.Mixed],
    required: true
  }
}, {
  timestamps: true
});

export type MapDocument = mongoose.InferSchemaType<typeof mapSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const MapModel = mongoose.models.Map ?? mongoose.model("Map", mapSchema);
