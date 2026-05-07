// CloudFront Function (cloudfront-js-2.0) attached to the distribution at
// viewer-request. 301-redirects non-canonical hosts to the canonical
// `taggartmaher.com` / `blog.taggartmaher.com`. Uploaded to AWS as the
// function `taggartmaher-redirect`.
function handler(event) {
  var request = event.request;
  var host = request.headers.host.value;
  var uri = request.uri;

  var querystring = "";
  var parts = [];
  for (var key in request.querystring) {
    var item = request.querystring[key];
    if (item.value !== undefined) {
      parts.push(key + "=" + item.value);
    } else {
      parts.push(key);
    }
    if (item.multiValue) {
      for (var index = 0; index < item.multiValue.length; index++) {
        parts.push(key + "=" + item.multiValue[index].value);
      }
    }
  }
  if (parts.length > 0) {
    querystring = "?" + parts.join("&");
  }

  if (host === "taggartmaher.com" || host === "blog.taggartmaher.com") {
    return request;
  }

  var targetHost;
  if (host === "blog.taggart-maher.com") {
    targetHost = "blog.taggartmaher.com";
  } else {
    targetHost = "taggartmaher.com";
  }

  return {
    statusCode: 301,
    statusDescription: "Moved Permanently",
    headers: {
      location: { value: "https://" + targetHost + uri + querystring },
      "cache-control": { value: "max-age=3600" },
    },
  };
}
