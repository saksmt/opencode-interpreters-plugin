{{ beforeOutputFormat }}
Output format:
 - execution result:
   - exit code (0-255) wrapped in `<exit>` tag when the script finished execution normally, for example `<exit>0</exit>`
   - `<exit>TIMEOUT</exit>` when execution timed out - read the results first and then decide if you need to call this tool again with greater timeout value, further tags will contain information at the time execution was timed out
   - `<exit>ABORTED</exit>` when user aborted execution, further tags will contain information at the time execution was aborted
 - number of lines and characters in output as attributes to `<total />` tag, for example, `<total lines=100 characters=1000 />`
 - either:
   - output (stdout, stderr or both) wrapped in `<output>` tag
   - start of the output wrapped in `<head>`, end of the output wrapped in `<tail>` and a path to the file with full output wrapped in `<output.file>`. This format is used when the output either exceeds {{ maxLines }} lines or {{ maxCharacters }} characters. Output in <head> and <tail> combined will have the same limit. Use Grep and Read tools to read the full output from the file in `<output.file>` if needed

{{ afterOutputFormat }}