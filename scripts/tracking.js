function getParameterByName(name, url = window.location.href) {
  name = name.replace(/[\[\]]/g, "\\$&");
  var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
    results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return "";
  return decodeURIComponent(results[2].replace(/\+/g, " "));
}

function getCookie(name) {
  let matches = document.cookie.match(
    new RegExp(
      "(?:^|; )" +
        name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, "\\$1") +
        "=([^;]*)",
    ),
  );
  return matches ? decodeURIComponent(matches[1]) : null;
}

document.addEventListener("DOMContentLoaded", function () {
  let fbclid = getParameterByName("fbclid");
  let fbcField = document.getElementById("fbc_field");
  let fbclidRawField = document.getElementById("fbclid_raw");

  if (fbclid) {
    if (fbclidRawField) fbclidRawField.value = fbclid;
    let fbcValue = "fb.1." + Date.now() + "." + fbclid;
    if (fbcField) fbcField.value = fbcValue;
  }

  let fbpField = document.getElementById("fbp_field");
  if (fbpField) {
    let fbpCookie = getCookie("_fbp");
    if (fbpCookie) fbpField.value = fbpCookie;
  }

  // Attach form listener
  const form = document.getElementById("remodel-estimate-form");
  if (form) {
    form.addEventListener("submit", submitFormToHubSpot);
  }
});

async function submitFormToHubSpot(e) {
  e.preventDefault();

  // Custom mapping for vanilla HTML values
  const email = document.querySelector('input[name="email"]')?.value || "";
  const firstname =
    document.querySelector('input[name="firstName"]')?.value || "";
  const lastname =
    document.querySelector('input[name="lastName"]')?.value || "";
  const phone = document.querySelector('input[name="phone"]')?.value || "";
  
  // Project Type Mapping to Internal HubSpot Names
  const serviceNode = document.querySelector(
    'input[name="projectType"]:checked',
  );
  let service = serviceNode ? serviceNode.value : "";
  const serviceMap = {
    'bathroom': 'bathroom_remodel',
    'kitchen': 'kitchen_remodel',
    'full-home-remodel': 'home_remodel',
    'painting-finishes': 'interior_upgrades',
    'flooring': 'interior_upgrades',
    'custom-cabinetry': 'interior_upgrades'
  };
  if (serviceMap[service]) service = serviceMap[service];

  const address =
    document.querySelector('input[name="projectLocation"]')?.value || "";
  
  // Urgency Mapping to Internal HubSpot Names
  const timelineNode = document.querySelector('select[name="timeline"]');
  let timeline = timelineNode ? timelineNode.value : "";
  const urgencyMap = {
    'asap': 'high',
    '1-3months': 'medium',
    '3-6months': 'low',
    '6-12months': 'low',
    'flexible': 'low'
  };
  if (urgencyMap[timeline]) timeline = urgencyMap[timeline];

  const sourceNode = document.querySelector('select[name="referral"]');
  const source = sourceNode ? sourceNode.value : "";
  const details =
    document.querySelector('textarea[name="message"]')?.value || "";

  const fbp = document.getElementById("fbp_field")?.value || "";
  const fbc = document.getElementById("fbc_field")?.value || "";
  const fbclidRaw = document.getElementById("fbclid_raw")?.value || "";

  const payload = {
    submittedAt: new Date().getTime(),
    fields: [
      { name: "email", value: email },
      { name: "firstname", value: firstname },
      { name: "lastname", value: lastname },
      { name: "phone", value: phone },
      { name: "service_scope", value: service },
      { name: "address", value: address },
      { name: "urgency", value: timeline },
      { name: "hear_about_us", value: source },
      { name: "message", value: details },
      { name: "fbp", value: fbp },
      { name: "fbc", value: fbc },
      { name: "fbclid_raw", value: fbclidRaw },
      { name: "book_meeting", value: "no" },
      { name: "service_form_filled", value: "no" }
    ],
    context: {
      pageUri: window.location.href,
      pageName: document.title,
    },
  };

  const hutk = getCookie("hubspotutk");
  if (hutk) {
    payload.context.hutk = hutk;
  }

  console.log("Submitting to HubSpot with payload:", payload);

  const submitButton =
    e.target.querySelector('button[type="submit"]') ||
    e.target.querySelector('input[type="submit"]');
  const originalButtonText = submitButton
    ? submitButton.innerText || submitButton.value
    : "Submit";

  if (submitButton) {
    submitButton.disabled = true;
    if (submitButton.innerText) submitButton.innerText = "Submitting...";
    else submitButton.value = "Submitting...";
  }

  // API Credentials from Integration Guide
  const portalId = '51388633';
  const formGuid = 'c5de09b0-5b5f-470d-83ac-b133359eec01';
  const endpoint = `https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formGuid}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log("✅ HubSpot submission success:", response.status);
      const serviceParam = service ? `?service=${service}` : "";
      
      if (timeline === "high") {
        window.location.href = `thank-you-high.html${serviceParam}`;
      } else if (timeline === "medium") {
        window.location.href = `thank-you-medium.html${serviceParam}`;
      } else {
        window.location.href = `thank-you-low.html${serviceParam}`;
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error("❌ HubSpot API Error:", response.status, errorData);
      
      let errorMsg = "There was an error submitting your form. Please try again.";
      if (errorData.errors && errorData.errors.length > 0) {
        errorMsg = "Submission Error: " + errorData.errors[0].message;
      }
      alert(errorMsg);
      
      if (submitButton) {
        submitButton.disabled = false;
        if (submitButton.innerText) submitButton.innerText = originalButtonText;
        else submitButton.value = originalButtonText;
      }
    }
  } catch (error) {
    console.error("❌ Network Error:", error);
    // Fallback redirect for local testing
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      console.warn("Local testing: Redirecting despite fetch error.");
      const serviceParam = service ? `?service=${service}` : "";
      if (timeline === "high") {
        window.location.href = `thank-you-high.html${serviceParam}`;
      } else if (timeline === "medium") {
        window.location.href = `thank-you-medium.html${serviceParam}`;
      } else {
        window.location.href = `thank-you-low.html${serviceParam}`;
      }
    } else {
      alert("Network error. Please check your connection and try again.");
      if (submitButton) {
        submitButton.disabled = false;
        if (submitButton.innerText) submitButton.innerText = originalButtonText;
        else submitButton.value = originalButtonText;
      }
    }
  }
}
