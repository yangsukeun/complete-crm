module.exports = function(source) {
  return require('typescript').transpileModule(source, {compilerOptions: {
    target: require('typescript').ScriptTarget.ES2020,
    module: require('typescript').ModuleKind.ESNext,
  }}).outputText;
};
