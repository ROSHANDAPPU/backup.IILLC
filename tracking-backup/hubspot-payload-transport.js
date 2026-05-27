// tracking.js - Interior Illusions LLC Tracking & HubSpot Form Mapping Helper
(function() {
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

    // Normalization on form submit to HubSpot lowercased defaults
    form.addEventListener("submit", function() {
      // Map 'firstName' input to 'firstname' for HubSpot integration
      var firstNameInput = form.querySelector('[name="firstName"]');
      if (firstNameInput) {
        createOrUpdateHiddenInput(form, "firstname", firstNameInput.value);
      }

      // Map 'lastName' input to 'lastname'
      var lastNameInput = form.querySelector('[name="lastName"]');
      if (lastNameInput) {
        createOrUpdateHiddenInput(form, "lastname", lastNameInput.value);
      }

      // Map 'email'
      var emailInput = form.querySelector('[name="email"]');
      if (emailInput) {
        createOrUpdateHiddenInput(form, "email", emailInput.value);
      }

      // Map 'phone'
      var phoneInput = form.querySelector('[name="phone"]');
      if (phoneInput) {
        createOrUpdateHiddenInput(form, "phone", phoneInput.value);
      }

      // Map other fields to lowercased values if needed
      var messageInput = form.querySelector('[name="message"]');
      if (messageInput) {
        createOrUpdateHiddenInput(form, "message", messageInput.value);
      }

      var projectLocationInput = form.querySelector('[name="projectLocation"]');
      if (projectLocationInput) {
        createOrUpdateHiddenInput(form, "projectlocation", projectLocationInput.value);
      }

      var projectTypeInput = form.querySelector('[name="projectType"]:checked') || form.querySelector('[name="projectType"]');
      if (projectTypeInput) {
        createOrUpdateHiddenInput(form, "projecttype", projectTypeInput.value);
      }

      var timelineInput = form.querySelector('[name="timeline"]');
      if (timelineInput) {
        createOrUpdateHiddenInput(form, "timeline", timelineInput.value);
      }

      var referralInput = form.querySelector('[name="referral"]');
      if (referralInput) {
        createOrUpdateHiddenInput(form, "referral", referralInput.value);
      }
    });
  });

  function createOrUpdateHiddenInput(form, name, value) {
    // If the input already exists as a hidden or regular field with that exact lowercased name, update it
    var input = form.querySelector('input[name="' + name + '"][type="hidden"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      form.appendChild(input);
    }
    input.value = value;
  }
})();
