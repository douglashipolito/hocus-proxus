exports.preprocessors = [require("./transpiler")];

exports.routes = [
  require("./routes/widget"),
  require("./routes/theme"),
  require("./routes/app-level")
];
