// tracking.js - Interior Illusions LLC Tracking & HubSpot Form Mapping Helper
(function () {
  // ==========================================
  // ADD YOUR PRIVATE API KEYS HERE (Lines 4-6)
  // ==========================================
  const portalId = 'YOUR_PORTAL_ID';       // <-- CHANGE THIS (Line 4)
  const formGuid = 'YOUR_FORM_GUID';       // <-- CHANGE THIS (Line 5)
  const accessToken = 'YOUR_ACCESS_TOKEN'; // <-- CHANGE THIS (Line 6)
  // ==========================================

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

  // Construct _fbc from fbclid if _fbc cookie doesn't exist
  if (!fbc && fbclid) {
    fbc = "fb.1." + Date.now() + "." + fbclid;
  }

  // Wait for DOM content to load to process forms
  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("remodel-estimate-form");
    if (!form) return;

    // Populate Facebook Pixel hidden fields if they exist
    var fbpField = document.getElementById("fbp_field");
    var fbcField = document.getElementById("fbc_field");
    var fbclidRaw = document.getElementById("fbclid_raw");

    if (fbpField && fbp) fbpField.value = fbp;
    if (fbcField && fbc) fbcField.value = fbc;
    if (fbclidRaw && fbclid) fbclidRaw.value = fbclid;

    // Intercept form submission to send securely to HubSpot API
    form.addEventListener("submit", function (event) {
      event.preventDefault(); // Stop page from reloading instantly to process background payload

      // Collect field values safely mapping to strict lowercase HubSpot defaults
      var fields = [];
      
      var firstNameVal = form.querySelector('[name="firstName"]')?.value || "";
      var lastNameVal = form.querySelector('[name="lastName"]')?.value || "";
      var emailVal = form.querySelector('[name="email"]')?.value || "";
      var phoneVal = form.querySelector('[name="phone"]')?.value || "";
      var messageVal = form.querySelector('[name="message"]')?.value || "";
      var locationVal = form.querySelector('[name="projectLocation"]')?.value || "";
      var projectTypeVal = form.querySelector('[name="projectType"]:checked')?.value || form.querySelector('[name="projectType"]')?.value || "";
      var timelineVal = form.querySelector('[name="timeline"]')?.value || "";
      var referralVal = form.querySelector('[name="referral"]')?.value || "";

      // Push mapped key-value pairs into HubSpot payload format
      fields.push({ name: "firstname", value: firstNameVal });
      fields.push({ name: "lastname", value: lastNameVal });
      fields.push({ name: "email", value: emailVal });
      fields.push({ name: "phone", value: phoneVal });
      fields.push({ name: "message", value: messageVal });
      fields.push({ name: "address", value: locationVal }); 
      fields.push({ name: "service", value: projectTypeVal }); 
      fields.push({ name: "preferred_timeline", value: timelineVal });
      fields.push({ name: "hear_about_us", value: referralVal });
      fields.push({ name: "fbp", value: fbpField?.value || fbp || "" });
      fields.push({ name: "fbc", value: fbcField?.value || fbc || "" });

      // Build context data packet
      var context = {
        hutk: getCookie("hubspotutk"),
        pageUri: window.location.href,
        pageName: document.title
      };

      // Construct final JSON object payload
      var payload = {
        fields: fields,
        context: context
      };

      // Construct API submission endpoint URL
      var endpoint = "https://api.hsforms.com/submissions/v3/integration/secure/submit/" + portalId + "/" + formGuid;

      // Execute Secure API Transport
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + accessToken
        },
        body: JSON.stringify(payload),
        keepalive: true
      })
      .then(function(response) {
        if (response.ok) {
          console.log("Success! Lead data sent to HubSpot.");
          // Execute redirect to approved thank-you page copy
          window.location.href = "https://interiorillusionsconstruction.com/thank-you";
        } else {
          console.error("HubSpot API Submission Error status code:", response.status);
          alert("There was an issue sending your request. Please try again.");
        }
      })
      .catch(function(error) {
        console.error("Network connectivity issue:", error);
        alert("Network error. Please check your internet connection.");
      });
    });
  });
})();
