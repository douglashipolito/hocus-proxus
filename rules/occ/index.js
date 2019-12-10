exports.preprocessors = [require("./transpiler")];

exports.routes = [
  require("./routes/rollup-babel-helper"),
  require("./routes/page"),
  require("./routes/javascript"),
  require("./routes/theme")
];
