exports.preprocessors = [require("./transpiler")];

exports.routes = [
  require("./routes/page"),
  require("./routes/javascript"),
  require("./routes/theme")
];
