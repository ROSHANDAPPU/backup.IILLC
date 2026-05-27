// tracking.js - Interior Illusions LLC Tracking & HubSpot Form Mapping Helper
(function() {
  // HubSpot API Keys Configuration
  const portalId = 'YOUR_PORTAL_ID';       // Replace with your 7-8 digit HubID
  const formGuid = 'YOUR_FORM_GUID';       // Replace with your alphanumeric HubSpot Form ID
  const accessToken = 'YOUR_ACCESS_TOKEN'; // Replace with your long private app access token

  // Helper to extract cookies
  function getCookie(name) {
    var value = "; " + document.cookie;
    var parts = value.split("; " + name + "=");
    if (parts.length === 2) return parts.pop().split(";").shift();
    return "";
  }

  // Helper to get URL parameter
  function getQueryParam(name) {
    var urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name) || "";
  }

  // Extract Tracking Values
  var fbp = getCookie("_fbp");
  var fbc = getCookie("_fbc");
  var fbclid = getQueryParam("fbclid");
  var hutk = getCookie("hubspotutk");

  // Construct _fbc from fbclid if _fbc cookie doesn't exist
  if (!fbc && fbclid) {
    // Standard format for _fbc: fb.1.[timestamp].[fbclid]
    fbc = "fb.1." + Date.now() + "." + fbclid;
  }

  // Wait for DOM content to load to process forms
  document.addEventListener("DOMContentLoaded", function() {
    var form = document.getElementById("remodel-estimate-form");
    if (!form) return;

    // Populate Facebook Pixel hidden fields if they exist
    var fbpField = document.getElementById("fbp_field");
    var fbcField = document.getElementById("fbc_field");
    var fbclidRaw = document.getElementById("fbclid_raw");

    if (fbpField && fbp) fbpField.value = fbp;
    if (fbcField && fbc) fbcField.value = fbc;
    if (fbclidRaw && fbclid) fbclidRaw.value = fbclid;

    // Normalization and Background Transmission on Submit
    form.addEventListener("submit", function(event) {
      // Prevent default form submission to allow fetch to complete first
      event.preventDefault();

      // Collect all fields
      var fields = [];
      
      function addField(name, value) {
        if (value !== undefined && value !== null) {
          fields.push({ name: name, value: String(value) });
        }
      }

      // Extract form input values
      var firstNameVal = form.querySelector('[name="firstName"]')?.value || "";
      var lastNameVal = form.querySelector('[name="lastName"]')?.value || "";
      var emailVal = form.querySelector('[name="email"]')?.value || "";
      var phoneVal = form.querySelector('[name="phone"]')?.value || "";
      var messageVal = form.querySelector('[name="message"]')?.value || "";
      var projectLocationVal = form.querySelector('[name="projectLocation"]')?.value || "";
      var projectTypeVal = form.querySelector('[name="projectType"]:checked')?.value || form.querySelector('[name="projectType"]')?.value || "";
      var timelineVal = form.querySelector('[name="timeline"]')?.value || "";
      var referralVal = form.querySelector('[name="referral"]')?.value || "";

      // Map to HubSpot lowercased defaults
      addField("firstname", firstNameVal);
      addField("lastname", lastNameVal);
      addField("email", emailVal);
      addField("phone", phoneVal);
      addField("message", messageVal);
      addField("projectlocation", projectLocationVal);
      addField("projecttype", projectTypeVal);
      addField("timeline", timelineVal);
      addField("referral", referralVal);
      
      // Also map Facebook Pixel parameters to HubSpot properties for attribution
      addField("fbp", fbp);
      addField("fbc", fbc);
      addField("fbclid", fbclid);

      // Build HubSpot Form Submission API Payload
      var payload = {
        fields: fields,
        context: {
          hutk: hutk,
          pageUri: window.location.href,
          pageName: document.title
        }
      };

      // HubSpot Submissions endpoint
      var url = "https://api.hsforms.com/submissions/v3/integration/submit/" + portalId + "/" + formGuid;

      // Build headers
      var headers = {
        "Content-Type": "application/json"
      };

      // If client is using private app authentication
      if (accessToken && accessToken !== 'YOUR_ACCESS_TOKEN') {
        headers["Authorization"] = "Bearer " + accessToken;
      }

      // Execute background transmission to HubSpot
      fetch(url, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: headers,
        keepalive: true // keeps request alive if navigation is fast
      })
      .then(function(response) {
        if (!response.ok) {
          console.warn("HubSpot submission returned status: " + response.status);
        }
        // Proceed with original FormSubmit.co action
        form.submit();
      })
      .catch(function(error) {
        console.error("Error submitting to HubSpot:", error);
        // Fallback: proceed to FormSubmit.co anyway so no leads are lost
        form.submit();
      });
    });
  });
})();
