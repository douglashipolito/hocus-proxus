define([#dependenciesImports], function(#allDependencies) {
  const allDependencies = arguments;

  let app = {
    onLoad : function () {
      var currentContext = this;
      var currentArguments = Array.prototype.slice.call(arguments);

      allDependencies.forEach(function (currentDependency) {
        if(currentDependency.onLoad) {
          currentDependency.onLoad.apply(currentContext, currentArguments);
        }
      });
    }
  };

  #dependenciesApp

  return app;
});