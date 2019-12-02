exports.preprocessors = [require("./transpiler")];

exports.routes = [
  require("./routes/javascript"),
  require("./routes/theme"),
  require("./routes/app-level")
];
