document.addEventListener('DOMContentLoaded', function() {
    // Toggle sidebar on mobile
    document.getElementById('sidebarToggle').addEventListener('click', function() {
      document.querySelector('.sidebar').classList.toggle('active');
    });
  
    // Initialize dropdowns
    const dropdownElementList = [].slice.call(document.querySelectorAll('.dropdown-toggle'));
    const dropdownList = dropdownElementList.map(function (dropdownToggleEl) {
      return new bootstrap.Dropdown(dropdownToggleEl);
    });
  
    // Load data dynamically (example with bookings)
    function loadBookings() {
      fetch('/api/bookings')
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            // Update bookings table
            console.log('Bookings loaded:', data.data);
          }
        })
        .catch(error => {
          console.error('Error loading bookings:', error);
        });
    }
  
    // Load all data on page load
    loadBookings();
  
    // Notification count update
    function updateNotificationCount() {
      fetch('/api/notifications/count')
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            document.getElementById('notificationCount').textContent = data.count;
          }
        });
    }
  
    // Update notification count every 30 seconds
    updateNotificationCount();
    setInterval(updateNotificationCount, 30000);
  });