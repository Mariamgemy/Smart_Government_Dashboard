const API_BASE_URL = "https://smartgovernment-fpcxb3cmfef3e6c0.uaenorth-01.azurewebsites.net/api/admin";
const HUB_URL = "https://smartgovernment-fpcxb3cmfef3e6c0.uaenorth-01.azurewebsites.net/dashboardHub";

let signalRConnection = null;
let datatableInstance = null;
let currentRequestsPage = 1;
const requestsPageSize = 5;

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
    toast.offsetHeight;
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toastContainer.removeChild(toast), 500);
    }, 3000);
}

if (!window.location.pathname.endsWith("login_edited.html") && !getAuthToken()) {
    console.log("No auth token found on page load, redirecting to login.");
    handleUnauthorized();
}

function initializeSignalR() {
    const token = getAuthToken();
    if (!token) {
        console.log("SignalR: No auth token, cannot connect.");
        return;
    }

    signalRConnection = new signalR.HubConnectionBuilder()
        .withUrl(HUB_URL, { accessTokenFactory: () => token })
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
            if (err.statusCode === 401 || err.message.includes("401")) {
                handleUnauthorized();
            }
        }
    }

    signalRConnection.onclose(async (error) => {
        console.log("SignalR Connection Closed.", error);
        showToastNotification("Real-time connection closed.", "info");
        if (error && (error.message.includes("401") || error.statusCode === 401)) {
            handleUnauthorized();
        }
    });

   // بهذا الكود المحسن:
signalRConnection.on("ReceiveRequestUpdated", (updatedRequest) => {
    console.log("SignalR: Request Updated: ", updatedRequest);
    
    // التحقق من وجود requestType قبل استخدام toLowerCase
    const requestType = updatedRequest?.requestType;
    if (typeof requestType === "string" && requestType.toLowerCase().includes("license")) {
        showToastNotification(`Request ${updatedRequest.requestId} updated to: ${updatedRequest.status}.`, "info");
        loadRequestsTable();
    }
});
    signalRConnection.on("ReceiveNewRequest", (newRequest) => {
        console.log("SignalR: New Request Received: ", newRequest);
        if (newRequest.requestType.toLowerCase().includes("license")) {
            showToastNotification(`New ${newRequest.requestType} submitted.`, "info");
            loadRequestsTable();
        }
    });

    startSignalRConnection();
}

async function fetchData(url, options = {}) {
    const token = getAuthToken();
    if (!token && !window.location.pathname.endsWith("login_edited.html")) {
        handleUnauthorized();
        return Promise.reject("No token");
    }

   const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    ...(options.headers || {})
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
        if (error.message.includes("unauthorized")) {
            handleUnauthorized();
        }
        throw error;
    }
}

async function loadRequestsTable(pageNumber = currentRequestsPage, pageSize = requestsPageSize, status = null, type = null, searchTerm = null) {
    currentRequestsPage = pageNumber;
    let queryParams = `?pageNumber=${pageNumber}&pageSize=${pageSize}&type=License`;
    if (status) queryParams += `&status=${status}`;
    if (type) queryParams += `&documentType=${type}`;
    if (searchTerm) queryParams += `&searchTerm=${encodeURIComponent(searchTerm)}`;

    const tableElement = document.getElementById("datatablesSimple");
    if (!tableElement) return;

    try {
        const pagedResult = await fetchData(`${API_BASE_URL}/requests${queryParams}`);
        console.log("API: License Requests Loaded: ", pagedResult);

        const dataForTable = {
            headings: ["Request ID", "Applicant Name", "NID", "Type", "Date", "Status", "Actions"],
            data: []
        };

        if (pagedResult.items?.length > 0) {
            pagedResult.items.forEach(req => {
                const date = new Date(req.requestDate);
                const formattedDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
                
                // Check for pending status (case-insensitive and trimmed)
                const statusLower = req.status?.toLowerCase().trim();
                const isPendingRequest = statusLower === "pending";
                
                // Debug log to see actual status values
                console.log(`Request ${req.requestId} status: "${req.status}" (normalized: "${statusLower}") - Show buttons: ${isPendingRequest}`);
                
                const actionButtons = isPendingRequest
                    ? `<button class="btn btn-sm btn-success me-1" onclick="approveRequest('license', '${req.requestId}')">
                          <i class="fas fa-check"></i> Approve
                       </button>
                       <button class="btn btn-sm btn-danger me-1" onclick="rejectRequest('license', '${req.requestId}')">
                          <i class="fas fa-times"></i> Reject
                       </button>`
                    : '';

                dataForTable.data.push([
                    req.requestId,
                    req.applicantName || 'N/A',
                    req.applicantNID?.trim() || 'N/A',
                    req.requestType,
                    formattedDate,
                    req.status || 'N/A',
                    `<button class="btn btn-sm btn-info me-1" onclick="viewRequestDetails('license', '${req.requestId}')">
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
                noRows: "No license requests found.",
                info: "Showing {start} to {end} of {rows} entries"
            }
        });

    } catch (error) {
        showToastNotification("Error loading license requests.", "error");
        if (datatableInstance) {
            datatableInstance.destroy();
            datatableInstance = new simpleDatatables.DataTable(tableElement, {
                data: { headings: ["Error"], data: [["Could not load data."]] },
                labels: { noRows: "Error loading requests." }
            });
        }
    }
}
async function approveRequest(requestType, requestId) {
    try {
        const result = await fetchData(`${API_BASE_URL}/requests/${requestType}/${requestId}/approve`, {
            method: "POST",
            body: JSON.stringify({ status: "Accepted", notes: "All documents verified. Approved" })
        });
        showToastNotification(`License request approved successfully.`, "success");
        loadRequestsTable();
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
body: JSON.stringify({ 
    notes: reason || "Request rejected.",
    status: "Rejected"
})
        });
        showToastNotification(`License request rejected successfully.`, "success");
        loadRequestsTable();
    } catch (error) {
        showToastNotification(`Failed to reject request: ${error.message}`, "error");
    }
}

async function viewRequestDetails(requestType, requestId) {
    try {
        const details = await fetchData(`${API_BASE_URL}/requests/${requestType}/${requestId}`);
        console.log("License Request Details:", details);
        showRequestDetailsModal(details);
    } catch (error) {
        showToastNotification(`Error viewing details: ${error.message}`, "error");
    }
}

function showRequestDetailsModal(details) {
    let modal = document.getElementById('requestDetailsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'requestDetailsModal';
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        modal.setAttribute('aria-labelledby', 'requestDetailsModalLabel');
        modal.setAttribute('aria-hidden', 'true');
        document.body.appendChild(modal);
    }

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

    let attachmentsHtml = '';
    if (details.attachments && details.attachments.length > 0) {
        attachmentsHtml = '<h5 class="mt-4">Attachments</h5><ul class="list-group">';
        details.attachments.forEach(attachment => {
            attachmentsHtml += `<li class="list-group-item">${attachment.name || 'Unnamed attachment'}</li>`;
        });
        attachmentsHtml += '</ul>';
    }

    modal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="requestDetailsModalLabel">License Request: ${details.requestId || 'N/A'}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div class="row">
                        <div class="col-md-6">
                            <p><strong>Applicant Name:</strong> ${details.applicantName || 'N/A'}</p>
                            <p><strong>NID:</strong> ${details.applicantNID ? details.applicantNID.trim() : 'N/A'}</p>
                            <p><strong>Request Type:</strong> ${details.requestType || 'N/A'}</p>
                        </div>
                        <div class="col-md-6">
                            <p><strong>Date:</strong> ${details.requestDate ? new Date(details.requestDate).toLocaleString() : 'N/A'}</p>
                            <p><strong>Status:</strong> ${details.status || 'N/A'}</p>
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

window.addEventListener("DOMContentLoaded", () => {
    if (!document.getElementById("toastContainer")) {
        const toastContainer = document.createElement("div");
        toastContainer.id = "toastContainer";
        toastContainer.style.position = "fixed";
        toastContainer.style.top = "20px";
        toastContainer.style.right = "20px";
        toastContainer.style.zIndex = "9999";
        document.body.appendChild(toastContainer);
    }

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
            .toast-notification.show { opacity: 1; }
            .toast-notification.success { background-color: #28a745; }
            .toast-notification.error { background-color: #dc3545; }
            .toast-notification.info { background-color: #17a2b8; }
            .toast-notification.warning { background-color: #ffc107; color: #212529; }
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

    document.getElementById("refreshRequests")?.addEventListener("click", () => {
        showToastNotification("Refreshing license requests...", "info");
        loadRequestsTable();
    });

    document.getElementById("requestStatusFilter")?.addEventListener("change", function() {
        loadRequestsTable(1, requestsPageSize, this.value, document.getElementById("requestTypeFilter").value, document.getElementById("searchFilter").value);
    });

    document.getElementById("requestTypeFilter")?.addEventListener("change", function() {
        loadRequestsTable(1, requestsPageSize, document.getElementById("requestStatusFilter").value, this.value, document.getElementById("searchFilter").value);
    });
    let autoRefreshInterval = null;

function startAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    autoRefreshInterval = setInterval(() => {
        console.log("Auto-refreshing table...");
        loadRequestsTable();
    }, 30000); // كل 30 ثانية
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

    document.getElementById("searchFilter")?.addEventListener("input", function() {
        loadRequestsTable(1, requestsPageSize, document.getElementById("requestStatusFilter").value, document.getElementById("requestTypeFilter").value, this.value);
    });

    document.getElementById("applyFilters")?.addEventListener("click", () => {
        loadRequestsTable(1, requestsPageSize, document.getElementById("requestStatusFilter").value, document.getElementById("requestTypeFilter").value, document.getElementById("searchFilter").value);
    });

    if (getAuthToken()) {
        initializeSignalR();
        loadRequestsTable();
    }
});
// إضافة auto-refresh
