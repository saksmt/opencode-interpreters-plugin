{{ beforeSandbox }}
IMPORTANT: script will be executed in transparent sandboxed environment. Only current project directory would be visible inside the script at the same path as outside.
Any files modified outside of the current project directory will be discarded. DO NOT create temporary files to pass data from script, pass everything you need to get from script to stdout. Alternatively write to file inside current project directory tree, but avoid writing to files tracked in git for temporary pass-through files.
{{ afterSandbox }}
