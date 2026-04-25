function getParameterByName(name, url = window.location.href) {
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

function getCookie(name) {
    let matches = document.cookie.match(new RegExp(
        "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
    ));
    return matches ? decodeURIComponent(matches[1]) : null;
}

document.addEventListener('DOMContentLoaded', function() {
    let fbclid = getParameterByName('fbclid');
    let fbcField = document.getElementById('fbc_field');
    let fbclidRawField = document.getElementById('fbclid_raw');

    if (fbclid) {
        if (fbclidRawField) fbclidRawField.value = fbclid;
        let fbcValue = 'fb.1.' + Date.now() + '.' + fbclid;
        if (fbcField) fbcField.value = fbcValue;
    }

    let fbpField = document.getElementById('fbp_field');
    if (fbpField) {
        let fbpCookie = getCookie('_fbp');
        if (fbpCookie) fbpField.value = fbpCookie;
    }

    // Attach form listener
    const form = document.getElementById('remodel-estimate-form');
    if (form) {
        form.addEventListener('submit', submitFormToHubSpot);
    }
});

async function submitFormToHubSpot(e) {
    e.preventDefault();
    
    // Constants placeholder for manager
    const portalId = '51388633';
    const formGuid = 'f47c4f3d-4891-4c48-a1a1-80a4240f5b51';
    const accessToken = 'pat-na1-92f05fa5-2818-4e52-a7b8-e9b4b43d9674';
    
    // Custom mapping for vanilla HTML values
    const email = document.querySelector('input[name="email"]')?.value || '';
    const firstname = document.querySelector('input[name="firstName"]')?.value || '';
    const lastname = document.querySelector('input[name="lastName"]')?.value || '';
    const phone = document.querySelector('input[name="phone"]')?.value || '';
    const serviceNode = document.querySelector('input[name="projectType"]:checked');
    const service = serviceNode ? serviceNode.value : '';
    const address = document.querySelector('input[name="projectLocation"]')?.value || '';
    const timelineNode = document.querySelector('select[name="timeline"]');
    const timeline = timelineNode ? timelineNode.value : '';
    const sourceNode = document.querySelector('select[name="referral"]');
    const source = sourceNode ? sourceNode.value : '';
    const details = document.querySelector('textarea[name="message"]')?.value || '';
    
    const fbp = document.getElementById('fbp_field')?.value || '';
    const fbc = document.getElementById('fbc_field')?.value || '';
    const fbclidRaw = document.getElementById('fbclid_raw')?.value || '';
    
    const payload = {
        submittedAt: new Date().getTime(),
        fields: [
            { name: "email", value: email },
            { name: "firstname", value: firstname },
            { name: "lastname", value: lastname },
            { name: "phone", value: phone },
            { name: "service", value: service },
            { name: "address", value: address },
            { name: "preferred.timeline", value: timeline },
            { name: "hear.about.us", value: source },
            { name: "project.details", value: details },
            { name: "fbp", value: fbp },
            { name: "fbc", value: fbc },
            { name: "fbc.lid_raw", value: fbclidRaw }
        ],
        context: {
            pageUri: window.location.href,
            pageName: document.title
        }
    };
    
    console.log("Submitting to HubSpot with payload:", payload);
    
    const submitButton = e.target.querySelector('button[type="submit"]') || e.target.querySelector('input[type="submit"]');
    const originalButtonText = submitButton ? (submitButton.innerText || submitButton.value) : 'Submit';
    
    if (submitButton) {
        submitButton.disabled = true;
        if (submitButton.innerText) submitButton.innerText = 'Submitting...';
        else submitButton.value = 'Submitting...';
    }
    
    const endpoint = `https://api.hsforms.com/submissions/v3/integration/secure/submit/${portalId}/${formGuid}`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
            console.log('✅ HubSpot submission success:', result);
            window.location.href = 'https://interiorillusionsconstruction.com/contact/thank-you.html';
        } else {
            console.error('❌ HubSpot API Error:', result);
            alert('There was an error submitting your form. Please try again.');
            if (submitButton) {
                submitButton.disabled = false;
                if (submitButton.innerText) submitButton.innerText = originalButtonText;
                else submitButton.value = originalButtonText;
            }
        }
    } catch (error) {
        console.error('❌ Network Error:', error);
        alert('Network error. Please check your connection and try again.');
        if (submitButton) {
            submitButton.disabled = false;
            if (submitButton.innerText) submitButton.innerText = originalButtonText;
            else submitButton.value = originalButtonText;
        }
    }
}
