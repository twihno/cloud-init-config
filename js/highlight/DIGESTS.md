## Subresource Integrity

If you are loading Highlight.js via CDN you may wish to use [Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) to guarantee that you are using a legimitate build of the library.

To do this you simply need to add the `integrity` attribute for each JavaScript file you download via CDN. These digests are used by the browser to confirm the files downloaded have not been modified.

```html
<script
  src="//cdnjs.cloudflare.com/ajax/libs/highlight.js/11.12.0/highlight.min.js"
  integrity="sha384-KnPvYPx1poT554tHDV1nuYV9sOkh4cZPBvLZQlXgJmoRQZPdgQNwL50/xq9kynp9"></script>
<!-- including any other grammars you might need to load -->
<script
  src="//cdnjs.cloudflare.com/ajax/libs/highlight.js/11.12.0/languages/go.min.js"
  integrity="sha384-orYKHAs3chK3oDMQLy5ywrzoY8z9zvzfmNIjmVxKXioAUtwDhP+xf6THWYSI/43Y"></script>
```

The full list of digests for every file can be found below.

### Digests

```
sha384-V4dEHxGPcfKe0nPj1Kf4bHhhEWQok5V5odOaTC9ADMs0bJqyVuFfVDkhTZaSWwpC /es/languages/yaml.js
sha384-nw7e1KnZnvc0mX9u7q45N8KXp4CIDO3+GsbJgpVp4Ye3b1taSPCD2+dtUlqqjTYC /es/languages/yaml.min.js
sha384-QiM+6eBaRFHV4SXe9mvWNsiQXkInig0NsYzM6aIHbVEcgJ2j4WDRKSjUBTkqLUjg /languages/yaml.js
sha384-3Z1ACXMaXuAS5eP39k4q24JKpbbb3hxVfEYQuXhujNu4KZSYl/BepBcMrSys6psg /languages/yaml.min.js
sha384-uxN9Bj0M9FksGO9RYY85ICeNICLamOKnhX690RhCbz6jYujSKHzE+yz1wHJVZ8Tj /highlight.js
sha384-qoiRXqahuP81vDbPgeU9LJrt41zkDWi8WrreLfhjZt9wlaRSy0rs8ZVqhb0s6kQW /highlight.min.js
```

