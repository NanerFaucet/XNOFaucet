const mongo = require("mongodb");

let client = new mongo.MongoClient(
  "mongodb+srv://db_user:" +
    encodeURIComponent(process.env.dbpass) +
    "@cluster0.0yo9r.mongodb.net/?retryWrites=true&w=majority",
  { useNewUrlParser: true, useUnifiedTopology: true }
);

module.exports = {
  getDb: async function () {
    await client.connect();
    return client.db("db");
  }
};
