<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Result</title>
  </head>
  <body>
    <pre><?php
      foreach (getallheaders() as $name => $value) {
        echo "$name: $value\n";
      }
    ?></pre>
    <div style="color: blue;"><?php
      echo $_POST["data"];
    ?></div>
  </body>
</html>
