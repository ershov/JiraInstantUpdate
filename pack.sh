#/bin/bash

NAME="$(basename $(PWD))"

egrep -e '"key"' -e '^\s*//' manifest.json && exit 1

(
  echo $'\nPacking for Chrome...'
  rm -f "../$NAME-chrome.zip"
  echo "Creating ../$NAME-chrome.zip"
  zip "../$NAME-chrome.zip" {script.js,style.css,manifest.json,icon3*.png}
)

echo $'\nPacking for Firefox...'
rm -f "../$NAME-firefox.zip"
echo "Creating ../$NAME-firefox.zip"
(
  mkdir -p moz
  cd moz
  unzip -q "../../$NAME-chrome.zip"
  perl -npE '$_ .= qq{  "browser_specific_settings": { "gecko": { "id": "{BCD72CC9-8546-4674-AB3C-6C5570C61194}" } },\n} if $. == 1;' manifest.json > manifest-moz.json
  mv -f manifest-moz.json manifest.json
  zip "../../$NAME-firefox.zip" *
)
rm -rf moz
