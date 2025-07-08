document.addEventListener("DOMContentLoaded", function () {
    const loginForm = document.getElementById("loginForm");
    const loginError = document.getElementById("loginError"); // Ensure this element exists in your login_edited.html

    if (loginForm) {
        loginForm.addEventListener("submit", async function (event) {
            event.preventDefault(); // Prevent default form submission

            const email = document.getElementById("inputEmail").value;
            const password = document.getElementById("inputPassword").value;
            
            if (loginError) loginError.textContent = ""; // Clear previous errors

            try {
                const response = await fetch("https://smartgovernment-fpcxb3cmfef3e6c0.uaenorth-01.azurewebsites.net/api/account/login", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ email: email, password: password }),
                });

                if (response.ok) {
                    const data = await response.json();
                    localStorage.setItem("authToken", data.token); // Store the token
                    // Redirect to the main dashboard page (assuming it is index_edited.html)
                    window.location.href = "index_edited.html"; 
                } else {
                    let errorMessage = "Login failed. Please check your credentials.";
                    try {
                        const errorData = await response.json();
                        errorMessage = errorData.message || (response.status === 401 ? "Invalid email or password." : `Error: ${response.status}`);
                    } catch (e) {
                        // If response is not JSON or other error parsing
                        errorMessage = `Login failed with status: ${response.status}`;
                    }
                    if (loginError) loginError.textContent = errorMessage;
                    console.error("Login failed:", response.status, errorMessage);
                }
            } catch (error) {
                if (loginError) loginError.textContent = "An error occurred during login. Please try again.";
                console.error("Login request error:", error);
            }
        });
    }
});

