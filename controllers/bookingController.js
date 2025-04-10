exports.updateStatus = async (req, res) => {
    try {
      const { id } = req.params;
      const { status, adminNotes } = req.body;
      
      const booking = await Booking.findByIdAndUpdate(
        id,
        { status, adminNotes, updatedAt: Date.now() },
        { new: true }
      );
  
      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }
  
      // Add to activity log
      await ActivityLog.create({
        type: 'booking',
        message: `Booking ${id} status updated to ${status}`,
        admin: req.user.id
      });
  
      res.redirect('/admin/dashboard');
    } catch (error) {
      console.error('Error updating booking status:', error);
      res.status(500).json({ error: 'Server error' });
    }
  };
  
  exports.approveBooking = async (req, res) => {
    try {
      const { id } = req.params;
      
      const booking = await Booking.findByIdAndUpdate(
        id,
        { status: 'confirmed', updatedAt: Date.now() },
        { new: true }
      );
  
      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }
  
      await ActivityLog.create({
        type: 'booking',
        message: `Booking ${id} approved by admin`,
        admin: req.user.id
      });
  
      res.redirect('/admin/dashboard');
    } catch (error) {
      console.error('Error approving booking:', error);
      res.status(500).json({ error: 'Server error' });
    }
  };
  
  exports.rejectBooking = async (req, res) => {
    try {
      const { id } = req.params;
      
      const booking = await Booking.findByIdAndUpdate(
        id,
        { status: 'rejected', updatedAt: Date.now() },
        { new: true }
      );
  
      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }
  
      await ActivityLog.create({
        type: 'booking',
        message: `Booking ${id} rejected by admin`,
        admin: req.user.id
      });
  
      res.redirect('/admin/dashboard');
    } catch (error) {
      console.error('Error rejecting booking:', error);
      res.status(500).json({ error: 'Server error' });
    }
  };