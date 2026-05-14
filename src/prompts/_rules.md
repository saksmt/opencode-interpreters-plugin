{{ beforeRules }}
DO NOT use this tool for:
 - Basic editing & reading commands (reading/writing/patching files, searching for files, grep-ping) - use specialized tools instead.
   Example of basic editing: read file A, change the 3rd line, write back. It is okay to use this tool for advanced use cases like: find all typescript files with length greater than 1000 lines and with a line matching regex X, extract file names and the thirty-third lines of those.
 - Interactive scripts - those requiring input in stdin; They WILL timeout.
{{ afterRules }}
