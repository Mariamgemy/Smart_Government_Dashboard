// E-Government Admin Dashboard Integration Logic (Updated Version)

// Base URL for your API
const API_BASE_URL = "https://smartgovernment-fpcxb3cmfef3e6c0.uaenorth-01.azurewebsites.net/api/admin"; 
const HUB_URL = "https://smartgovernment-fpcxb3cmfef3e6c0.uaenorth-01.azurewebsites.net/dashboardHub";

let signalRConnection = null;

// --- Utility Functions ---
function getAuthToken() {
    return localStorage.getItem("authToken");
}

function handleUnauthorized() {
    console.warn("Unauthorized or token expired. Redirecting to login.");
    localStorage.removeItem("authToken");
    showToastNotification("Unauthorized access. Redirecting to login...", "error");
    setTimeout(() => {
        if (!window.location.pathname.endsWith("login_edited.html")) {
            window.location.href = "login_edited.html"; 
        }
    }, 2000);
}

function showToastNotification(message, type = "info") {
    const toastContainer = document.getElementById("toastContainer") || document.body;
    const toast = document.createElement("div");
    toast.className = `toast-notification ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    // Trigger reflow to enable animation
    toast.offsetHeight; 

    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => {
            toastContainer.removeChild(toast);
        }, 500);
    }, 3000);
}

// --- 0. Check for token on page load ---
if (!window.location.pathname.endsWith("login_edited.html")) {
    if (!getAuthToken()) {
        console.log("No auth token found on page load, redirecting to login.");
        handleUnauthorized();
    }
}

// --- 1. SignalR Connection ---
function initializeSignalR() {
    const token = getAuthToken();
    if (!token && !window.location.pathname.endsWith("login_edited.html")) {
        console.log("SignalR: No auth token, cannot connect.");
        return; 
    }

    signalRConnection = new signalR.HubConnectionBuilder()
        .withUrl(HUB_URL, {
            accessTokenFactory: () => token 
        })
        .configureLogging(signalR.LogLevel.Information)
        .build();

    async function startSignalRConnection() {
        try {
            await signalRConnection.start();
            console.log("SignalR Connected.");
            showToastNotification("Real-time connection established.", "success");
        } catch (err) {
            console.error("SignalR Connection Error: ", err);
            showToastNotification("SignalR Connection Error.", "error");
            if (err && (err.statusCode === 401 || err.message.includes("401"))) {
                handleUnauthorized();
            }
        }
    }

    signalRConnection.onclose(async (error) => {
        console.log("SignalR Connection Closed.", error);
        showToastNotification("Real-time connection closed.", "info");
        if (error && (error.message.includes("401") || (error.statusCode && error.statusCode === 401))) {
            handleUnauthorized();
        } 
    });

    if (token || window.location.pathname.endsWith("login_edited.html")) {
        startSignalRConnection();
    }

    // --- 2. Receiving Real-time Updates ---
    signalRConnection.on("ReceiveStatisticsUpdate", (stats) => {
        console.log("SignalR: Statistics Update Received: ", stats);
        updateDashboardStatisticCards(stats);
        showToastNotification("Dashboard statistics updated.", "info");
    });

    signalRConnection.on("ReceiveRequestUpdated", (updatedRequest) => {
        console.log("SignalR: Request Updated: ", updatedRequest);
        if (document.getElementById("datatablesSimple")) {
            showToastNotification(`Request ${updatedRequest.requestId} updated to: ${updatedRequest.status}.`, "info");
            loadRequestsTable();
        }
    });

    signalRConnection.on("ReceiveNewRequest", (newRequest) => {
        console.log("SignalR: New Request Received: ", newRequest);
        if (document.getElementById("datatablesSimple")) {
            showToastNotification(`New ${newRequest.requestType} submitted.`, "info");
            loadRequestsTable();
        }
    });
}

// --- Helper Functions ---
function updateDashboardStatisticCards(stats) {
    const updateCard = (id, icon, text, value) => {
        const elem = document.getElementById(id);
        if (elem) elem.innerHTML = `<i class="fas ${icon} me-2"></i>${text}: ${value || 0}`;
    };

    updateCard("totalLicenseRequestsCardBody", "fa-id-card", "Total Licenses", stats.totalLicenseRequests);
    updateCard("pendingCivilDocsCardBody", "fa-file-alt", "Pending Civil Docs", stats.pendingCivilDocRequests);
    updateCard("activeUsersCardBody", "fa-users", "Active Users", stats.activeUsers);
    updateCard("rejectedRequestsCardBody", "fa-times-circle", "Rejected Licenses", stats.rejectedLicenseRequests);
}

// --- 3. API Data Fetching ---
async function fetchData(url, options = {}) {
    const token = getAuthToken();
    if (!token && !window.location.pathname.endsWith("login_edited.html")) {
        handleUnauthorized();
        return Promise.reject("No token");
    }

    const headers = {
        ...options.headers,
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };

    try {
        const response = await fetch(url, { ...options, headers });
        if (!response.ok) {
            if (response.status === 401) {
                handleUnauthorized();
                return Promise.reject("Unauthorized");
            }
            const errorData = await response.json().catch(() => ({ message: "HTTP error!" }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        return response.json();
    } catch (error) {
        console.error(`Failed to fetch data from ${url}:`, error);
        if (error.message && error.message.toLowerCase().includes("unauthorized")) {
            handleUnauthorized();
        }
        throw error;
    }
}

// --- Dashboard Functions ---
async function loadDashboardStatistics() {
    try {
        const stats = await fetchData(`${API_BASE_URL}/statistics`);
        console.log("API: Statistics Loaded: ", stats);
        updateDashboardStatisticCards(stats);
        
        // Update chart data based on statistics
        if (window.myAreaChart && window.updateAreaChart) {
            updateAreaChart(stats);
        }
        
        if (window.myBarChart && window.updateBarChart) {
            updateBarChart(stats);
        }
    } catch (error) {
        showToastNotification("Failed to load dashboard statistics.", "error");
    }
}

let currentRequestsPage = 1;
const requestsPageSize = 5; // Match the API default page size
let datatableInstance = null;

async function loadRequestsTable(pageNumber = currentRequestsPage, pageSize = requestsPageSize, status = null, type = null, searchTerm = null) {
    currentRequestsPage = pageNumber;
    let queryParams = `?pageNumber=${pageNumber}&pageSize=${pageSize}`;
    if (status) queryParams += `&status=${status}`;
    if (type) queryParams += `&type=${type}`;
    if (searchTerm) queryParams += `&searchTerm=${encodeURIComponent(searchTerm)}`;

    const tableElement = document.getElementById("datatablesSimple");
    if (!tableElement) return;

    try {
        const pagedResult = await fetchData(`${API_BASE_URL}/requests${queryParams}`);
        console.log("API: Requests Loaded: ", pagedResult);

        const dataForTable = {
            headings: ["Request ID", "Applicant Name", "NID", "Type", "Date", "Status", "Actions"],
            data: []
        };

        if (pagedResult.items?.length > 0) {
            pagedResult.items.forEach(req => {
                const date = new Date(req.requestDate);
                const formattedDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
                
                // Determine if should show action buttons based on status
                // Note: Changed to match your endpoint requirements - only show buttons for "New" status
                const isNewRequest = req.status?.toLowerCase() === "new";
                const requestType = req.requestType.toLowerCase().includes("license") ? "license" : "civil";
                
                const actionButtons = isNewRequest 
                    ? `<button class="btn btn-sm btn-success me-1" onclick="approveRequest('${requestType}', '${req.requestId}')">
                          <i class="fas fa-check"></i> Approve
                       </button>
                       <button class="btn btn-sm btn-danger me-1" onclick="rejectRequest('${requestType}', '${req.requestId}')">
                          <i class="fas fa-times"></i> Reject
                       </button>`
                    : '';

                dataForTable.data.push([
                    req.requestId,
                    req.applicantName,
                    req.applicantNID.trim(), // Trim the padding spaces in the NID
                    req.requestType,
                    formattedDate, 
                    req.status,
                    `<button class="btn btn-sm btn-info me-1" onclick="viewRequestDetails('${requestType}', '${req.requestId}')">
                        <i class="fas fa-eye"></i> View
                     </button>
                     ${actionButtons}`
                ]);
            });
        }

        if (datatableInstance) {
            datatableInstance.destroy();
        }
        
        datatableInstance = new simpleDatatables.DataTable(tableElement, {
            data: dataForTable,
            searchable: true,
            pagination: true,
            perPage: pageSize,
            labels: {
                placeholder: "Search requests...",
                noRows: "No requests found.",
                info: "Showing {start} to {end} of {rows} entries"
            }
        });

    } catch (error) {
        showToastNotification("Error loading requests table.", "error");
        if (datatableInstance) {
            datatableInstance.destroy();
            datatableInstance = new simpleDatatables.DataTable(tableElement, {
                data: { headings: ["Error"], data: [["Could not load data."]] },
                labels: { noRows: "Error loading requests." }
            });
        }
    }
}

// --- Updated Functions for API Integration ---
async function approveRequest(requestType, requestId) {
    try {
        // Use direct endpoint path based on API structure
        const result = await fetchData(`${API_BASE_URL}/requests/${requestType}/${requestId}/approve`, {
            method: "POST",
            body: JSON.stringify({status: "Accepted", notes: "All documents verified. Approved" })
        });
        
        showToastNotification(`Request approved successfully.`, "success");
        loadRequestsTable(currentRequestsPage);
        loadDashboardStatistics();
    } catch (error) {
        showToastNotification(`Failed to approve request: ${error.message}`, "error");
    }
}

async function rejectRequest(requestType, requestId) {
    const reason = prompt("Enter reason for rejection:");
    
    if (reason === null) {
        showToastNotification("Rejection cancelled.", "info");
        return;
    }

    try {
        const result = await fetchData(`${API_BASE_URL}/requests/${requestType}/${requestId}/reject`, {
            method: "POST",
            body: JSON.stringify({ notes: reason || "Request rejected." })
        });
        
        showToastNotification(`Request rejected successfully.`, "success");
        loadRequestsTable(currentRequestsPage);
        loadDashboardStatistics();
    } catch (error) {
        showToastNotification(`Failed to reject request: ${error.message}`, "error");
    }
}

async function viewRequestDetails(requestType, requestId) {
    try {
        const details = await fetchData(`${API_BASE_URL}/requests/${requestType}/${requestId}`);
        console.log("Request Details:", details);
        
        // Create and show modal with details
        showRequestDetailsModal(details);
    } catch (error) {
        showToastNotification(`Error viewing details: ${error.message}`, "error");
    }
}

function showRequestDetailsModal(details) {
    // Create modal container if it doesn't exist
    let modal = document.getElementById('requestDetailsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'requestDetailsModal';
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-labelledby', 'requestDetailsModalLabel');
        modal.setAttribute('aria-hidden', 'true');
        
        document.body.appendChild(modal);
    }
    
    // Format history items
    let historyHtml = '';
    if (details.history && details.history.length > 0) {
        historyHtml = '<h5 class="mt-4">Request History</h5><ul class="list-group">';
        details.history.forEach(item => {
            const date = item.date ? new Date(item.date).toLocaleString() : 'N/A';
            historyHtml += `
                <li class="list-group-item">
                    <strong>Status:</strong> ${item.status || 'N/A'} 
                    <strong>Date:</strong> ${date}
                    ${item.remarks ? `<br><strong>Remarks:</strong> ${item.remarks}` : ''}
                </li>`;
        });
        historyHtml += '</ul>';
    }
    
    // Format attachments if any
    let attachmentsHtml = '';
    if (details.attachments && details.attachments.length > 0) {
        attachmentsHtml = '<h5 class="mt-4">Attachments</h5><ul class="list-group">';
        details.attachments.forEach(attachment => {
            attachmentsHtml += `<li class="list-group-item">${attachment.name || 'Unnamed attachment'}</li>`;
        });
        attachmentsHtml += '</ul>';
    }
    
    modal.innerHTML = `
        <div class="modal-dialog modal-lg" role="document">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="requestDetailsModalLabel">Request Details: ${details.id}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div class="row">
                        <div class="col-md-6">
                            <p><strong>Applicant Name:</strong> ${details.applicantName || 'N/A'}</p>
                            <p><strong>NID:</strong> ${details.applicantNID ? details.applicantNID.trim() : 'N/A'}</p>
                            <p><strong>Request Type:</strong> ${details.documentType || 'N/A'}</p>
                        </div>
                        <div class="col-md-6">
                            <p><strong>Date:</strong> ${details.requestDate ? new Date(details.requestDate).toLocaleString() : 'N/A'}</p>
                            <p><strong>Status:</strong> ${details.currentStatus || 'N/A'}</p>
                            <p><strong>Notes:</strong> ${details.notes || 'No notes'}</p>
                        </div>
                    </div>
                    ${attachmentsHtml}
                    ${historyHtml}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>
    `;
    
    // Show the modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

function logout() {
    localStorage.removeItem("authToken");
    showToastNotification("You have been logged out.", "success");
    setTimeout(() => {
        window.location.href = "login_edited.html";
    }, 1500);
}

// --- Chart initialization ---
function initializeCharts() {
    // Set new default font family and font color to mimic Bootstrap's default styling
    Chart.defaults.global.defaultFontFamily = '-apple-system,system-ui,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
    Chart.defaults.global.defaultFontColor = '#292b2c';

    // Area Chart Example
    const areaChart = document.getElementById("myAreaChart");
    if (!areaChart) return;
    
    window.myAreaChart = new Chart(areaChart, {
        type: 'line',
        data: {
            labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
            datasets: [{
                label: "Requests",
                lineTension: 0.3,
                backgroundColor: "rgba(2,117,216,0.2)",
                borderColor: "rgba(2,117,216,1)",
                pointRadius: 5,
                pointBackgroundColor: "rgba(2,117,216,1)",
                pointBorderColor: "rgba(255,255,255,0.8)",
                pointHoverRadius: 5,
                pointHoverBackgroundColor: "rgba(2,117,216,1)",
                pointHitRadius: 50,
                pointBorderWidth: 2,
                data: [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65],
            }],
        },
        options: {
            scales: {
                xAxes: [{
                    time: { unit: 'date' },
                    gridLines: { display: false },
                    ticks: { maxTicksLimit: 7 }
                }],
                yAxes: [{
                    ticks: {
                        min: 0,
                        maxTicksLimit: 5
                    },
                    gridLines: {
                        color: "rgba(0, 0, 0, .125)",
                    }
                }],
            },
            legend: { display: false }
        }
    });

    // Bar Chart Example
    const barChart = document.getElementById("myBarChart");
    if (!barChart) return;
    
    window.myBarChart = new Chart(barChart, {
        type: 'bar',
        data: {
            labels: ["License", "Civil Documents", "Other"],
            datasets: [{
                label: "Requests",
                backgroundColor: ["#007bff", "#ffc107", "#28a745"],
                borderColor: ["#0056b3", "#d39e00", "#1e7e34"],
                data: [0, 0, 0],
            }],
        },
        options: {
            scales: {
                xAxes: [{
                    gridLines: { display: false },
                    barPercentage: 0.6,
                }],
                yAxes: [{
                    ticks: {
                        min: 0,
                        maxTicksLimit: 5
                    },
                    gridLines: {
                        display: true
                    }
                }],
            },
            legend: { display: false }
        }
    });

    // Function to update charts with real data
    window.updateAreaChart = function(stats) {
        // This would normally use historical data, but for demo we'll simulate
        const monthlyData = [
            stats.totalLicenseRequests || 0,
            stats.totalLicenseRequests + 5 || 5,
            stats.totalLicenseRequests + 10 || 10,
            stats.totalCivilDocRequests || 0,
            stats.totalCivilDocRequests + 5 || 5, 
            stats.totalCivilDocRequests + 10 || 10,
            stats.totalUsers || 0,
            stats.totalUsers + 2 || 2,
            stats.pendingLicenseRequests || 0,
            stats.pendingCivilDocRequests || 0,
            stats.approvedLicenseRequests || 0,
            stats.approvedCivilDocRequests || 0
        ];
        
        window.myAreaChart.data.datasets[0].data = monthlyData;
        window.myAreaChart.update();
    };

    window.updateBarChart = function(stats) {
        window.myBarChart.data.datasets[0].data = [
            stats.totalLicenseRequests || 0,
            stats.totalCivilDocRequests || 0,
            (stats.otherStats && stats.otherStats.totalOtherRequests) || 0
        ];
        window.myBarChart.update();
    };
}

// --- Initialize on Page Load ---
window.addEventListener("DOMContentLoaded", () => {
    // Create toast container if it doesn't exist
    if (!document.getElementById("toastContainer")) {
        const toastContainer = document.createElement("div");
        toastContainer.id = "toastContainer";
        toastContainer.style.position = "fixed";
        toastContainer.style.top = "20px";
        toastContainer.style.right = "20px";
        toastContainer.style.zIndex = "9999";
        document.body.appendChild(toastContainer);
    }

    // Add CSS for toast notifications if not already in styles.css
    if (!document.getElementById("toastStyles")) {
        const style = document.createElement("style");
        style.id = "toastStyles";
        style.textContent = `
            .toast-notification {
                padding: 12px 20px;
                color: white;
                border-radius: 4px;
                margin-bottom: 10px;
                opacity: 0;
                transition: opacity 0.3s ease-in-out;
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                max-width: 350px;
            }
            .toast-notification.show {
                opacity: 1;
            }
            .toast-notification.success {
                background-color: #28a745;
            }
            .toast-notification.error {
                background-color: #dc3545;
            }
            .toast-notification.info {
                background-color: #17a2b8;
            }
            .toast-notification.warning {
                background-color: #ffc107;
                color: #212529;
            }
        `;
        document.head.appendChild(style);
    }

    const sidebarToggle = document.body.querySelector("#sidebarToggle");
    if (sidebarToggle) {
        sidebarToggle.addEventListener("click", (e) => {
            e.preventDefault();
            document.body.classList.toggle("sb-sidenav-toggled");
            localStorage.setItem("sb|sidebar-toggle", document.body.classList.contains("sb-sidenav-toggled"));
        });
    }

    document.getElementById("logoutButton")?.addEventListener("click", (e) => {
        e.preventDefault();
        logout();
    });

    // Initialize charts
    initializeCharts();

    if (!window.location.pathname.endsWith("login_edited.html") && getAuthToken()) {
        initializeSignalR();
        loadDashboardStatistics();
        if (document.getElementById("datatablesSimple")) {
            loadRequestsTable();
        }
    }
});