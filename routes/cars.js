const express = require('express');
const router = express.Router();
const Car = require('../models/Car');
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');
const upload = require('../config/multer');
const fs = require('fs');
const path = require('path');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Helper functions
const deleteFile = (filePath) => {
  if (filePath && !filePath.includes('default-car.jpg')) {
    const fullPath = path.join(__dirname, '../public', filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlink(fullPath, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
  }
};

const processFeatures = (features, additionalFeatures) => {
  const featuresArray = Array.isArray(features) ? features : [];
  if (additionalFeatures) {
    featuresArray.push(...additionalFeatures.split(',').map(f => f.trim()));
  }
  return [...new Set(featuresArray.filter(f => f))]; // Remove duplicates
};

const validateObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Validation rules
const carValidationRules = [
  body('make').trim().notEmpty().withMessage('Manufacturer is required')
    .isLength({ max: 50 }).withMessage('Make cannot exceed 50 characters'),
  body('model').trim().notEmpty().withMessage('Model is required')
    .isLength({ max: 50 }).withMessage('Model cannot exceed 50 characters'),
  body('type').isIn([
    'Sedan', 'SUV', 'Truck', 'Van/Minivan', 'Coupe',
    'Hatchback', 'Convertible', 'Wagon', 'Electric',
    'Hybrid', 'Luxury', 'Sports'
  ]).withMessage('Invalid vehicle type'),
  body('year').isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage(`Year must be between 1900 and ${new Date().getFullYear() + 1}`),
  body('dailyRate').isFloat({ min: 0 }).withMessage('Daily rate must be a positive number'),
  body('weeklyRate').optional().isFloat({ min: 0 }).withMessage('Weekly rate must be a positive number'),
  body('monthlyRate').optional().isFloat({ min: 0 }).withMessage('Monthly rate must be a positive number'),
  body('seats').isInt({ min: 1, max: 15 }).withMessage('Seats must be between 1 and 15'),
  body('doors').isInt({ min: 1, max: 6 }).withMessage('Doors must be between 1 and 6'),
  body('luggage').isInt({ min: 0 }).withMessage('Luggage capacity cannot be negative'),
  body('transmission').isIn(['Automatic', 'Manual', 'CVT', 'Semi-Automatic', 'Dual-Clutch'])
    .withMessage('Invalid transmission type'),
  body('fuelType').isIn(['Gasoline', 'Diesel', 'Hybrid', 'Electric', 'CNG', 'LPG'])
    .withMessage('Invalid fuel type'),
  body('vin').optional().matches(/^[A-HJ-NPR-Z0-9]{17}$/).withMessage('Invalid VIN format'),
  body('licensePlate').optional().trim().isLength({ max: 15 })
    .withMessage('License plate cannot exceed 15 characters')
];

// Get all cars with advanced filtering, sorting and pagination
router.get('/', async (req, res, next) => {
  try {
    const { 
      type, make, minPrice, maxPrice, 
      minYear, maxYear, transmission, fuelType,
      minSeats, sortBy = 'createdAt', sortOrder = 'desc',
      page = 1, limit = 12, search
    } = req.query;

    const filter = { available: true };
    
    // Build filter object
    if (type) filter.type = type;
    if (make) filter.make = new RegExp(make, 'i');
    if (transmission) filter.transmission = transmission;
    if (fuelType) filter.fuelType = fuelType;
    if (minSeats) filter.seats = { $gte: parseInt(minSeats) };
    
    // Price range
    if (minPrice || maxPrice) {
      filter.dailyRate = {};
      if (minPrice) filter.dailyRate.$gte = parseFloat(minPrice);
      if (maxPrice) filter.dailyRate.$lte = parseFloat(maxPrice);
    }
    
    // Year range
    if (minYear || maxYear) {
      filter.year = {};
      if (minYear) filter.year.$gte = parseInt(minYear);
      if (maxYear) filter.year.$lte = parseInt(maxYear);
    }
    
    // Search functionality
    if (search) {
      filter.$or = [
        { make: new RegExp(search, 'i') },
        { model: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    
    const [cars, total, makes, types] = await Promise.all([
      Car.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Car.countDocuments(filter),
      Car.distinct('make').sort(),
      Car.distinct('type').sort()
    ]);

    const totalPages = Math.ceil(total / limit);

    res.render('cars/list', {
      title: 'Available Cars',
      cars,
      user: req.user || null,
      currentPage: parseInt(page),
      totalPages,
      makes,
      types,
      query: req.query,
      sortOptions: {
        fields: ['make', 'model', 'year', 'dailyRate', 'createdAt'],
        currentField: sortBy,
        currentOrder: sortOrder
      }
    });
  } catch (err) {
    next(err);
  }
});

// Show add car form (Admin only)
router.get('/add', ensureAuthenticated, ensureAdmin, async (req, res, next) => {
  try {
    res.render('cars/add', {
      title: 'Add New Car',
      user: req.user,
      makes: await Car.distinct('make').sort(),
      fuelTypes: ['Gasoline', 'Diesel', 'Hybrid', 'Electric', 'CNG', 'LPG'],
      transmissions: ['Automatic', 'Manual', 'CVT', 'Semi-Automatic', 'Dual-Clutch'],
      vehicleTypes: [
        'Sedan', 'SUV', 'Truck', 'Van/Minivan', 'Coupe',
        'Hatchback', 'Convertible', 'Wagon', 'Electric',
        'Hybrid', 'Luxury', 'Sports'
      ]
    });
  } catch (err) {
    next(err);
  }
});

// Handle new car submission (Admin only)
router.post(
  '/',
  ensureAuthenticated,
  ensureAdmin,
  upload.fields([
    { name: 'mainImage', maxCount: 1 },
    { name: 'galleryImages', maxCount: 10 }
  ]),
  carValidationRules,
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Clean up uploaded files if validation fails
        if (req.files) {
          Object.values(req.files).flat().forEach(file => deleteFile(file.path));
        }
        
        const errorMessages = errors.array().map(e => e.msg);
        req.flash('error_msg', errorMessages.join('<br>'));
        return res.redirect('/cars/add');
      }

      const {
        make, model, type, year, color, vin, licensePlate,
        dailyRate, weeklyRate, monthlyRate, minimumRentalDays, depositRequired,
        seats, doors, luggage, engineSize, transmission, fuelType,
        mpgCity, mpgHighway, fuelTankCapacity,
        features, additionalFeatures, description, shortDescription
      } = req.body;

      // Process images
      const mainImage = req.files.mainImage?.[0]?.path.replace('public', '') || '/uploads/default-car.jpg';
      const galleryImages = req.files.galleryImages?.map(file => file.path.replace('public', '')) || [];

      const newCar = new Car({
        make,
        model,
        type,
        year: parseInt(year),
        color,
        vin,
        licensePlate,
        dailyRate: parseFloat(dailyRate),
        weeklyRate: weeklyRate ? parseFloat(weeklyRate) : undefined,
        monthlyRate: monthlyRate ? parseFloat(monthlyRate) : undefined,
        minimumRentalDays: minimumRentalDays ? parseInt(minimumRentalDays) : 1,
        depositRequired: depositRequired ? parseFloat(depositRequired) : 0,
        seats: parseInt(seats),
        doors: parseInt(doors),
        luggage: parseInt(luggage),
        engineSize: engineSize ? parseFloat(engineSize) : undefined,
        transmission,
        fuelType,
        mpgCity: mpgCity ? parseFloat(mpgCity) : undefined,
        mpgHighway: mpgHighway ? parseFloat(mpgHighway) : undefined,
        fuelTankCapacity: fuelTankCapacity ? parseFloat(fuelTankCapacity) : undefined,
        features: processFeatures(features, additionalFeatures),
        additionalFeatures,
        description,
        shortDescription,
        mainImage,
        galleryImages,
        available: true,
        createdBy: req.user._id
      });

      await newCar.save();
      req.flash('success_msg', `${make} ${model} added successfully`);
      res.redirect(`/cars/${newCar._id}`);
    } catch (err) {
      // Clean up uploaded files if error occurred
      if (req.files) {
        Object.values(req.files).flat().forEach(file => deleteFile(file.path));
      }
      next(err);
    }
  }
);

// Show single car details
router.get('/:id', async (req, res, next) => {
  try {
    if (!validateObjectId(req.params.id)) {
      req.flash('error_msg', 'Invalid car ID');
      return res.redirect('/cars');
    }

    const car = await Car.findById(req.params.id).populate('createdBy', 'name email');
    
    if (!car) {
      req.flash('error_msg', 'Car not found');
      return res.redirect('/cars');
    }

    const similarCars = await Car.find({
      type: car.type,
      _id: { $ne: car._id },
      available: true
    })
    .limit(4)
    .lean();

    res.render('cars/single', {
      title: `${car.year} ${car.make} ${car.model}`,
      car,
      similarCars,
      user: req.user || null,
      isAdmin: req.user?.role === 'admin'
    });
  } catch (err) {
    next(err);
  }
});

// Show edit car form (Admin only)
router.get('/:id/edit', ensureAuthenticated, ensureAdmin, async (req, res, next) => {
  try {
    if (!validateObjectId(req.params.id)) {
      req.flash('error_msg', 'Invalid car ID');
      return res.redirect('/cars');
    }

    const car = await Car.findById(req.params.id);
    if (!car) {
      req.flash('error_msg', 'Car not found');
      return res.redirect('/cars');
    }

    res.render('cars/edit', {
      title: `Edit ${car.make} ${car.model}`,
      car,
      user: req.user,
      makes: await Car.distinct('make').sort(),
      fuelTypes: ['Gasoline', 'Diesel', 'Hybrid', 'Electric', 'CNG', 'LPG'],
      transmissions: ['Automatic', 'Manual', 'CVT', 'Semi-Automatic', 'Dual-Clutch'],
      vehicleTypes: [
        'Sedan', 'SUV', 'Truck', 'Van/Minivan', 'Coupe',
        'Hatchback', 'Convertible', 'Wagon', 'Electric',
        'Hybrid', 'Luxury', 'Sports'
      ]
    });
  } catch (err) {
    next(err);
  }
});

// Handle car update (Admin only)
router.put(
  '/:id',
  ensureAuthenticated,
  ensureAdmin,
  upload.fields([
    { name: 'mainImage', maxCount: 1 },
    { name: 'galleryImages', maxCount: 10 }
  ]),
  carValidationRules,
  async (req, res, next) => {
    try {
      if (!validateObjectId(req.params.id)) {
        req.flash('error_msg', 'Invalid car ID');
        return res.redirect('/cars');
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Clean up uploaded files if validation fails
        if (req.files) {
          Object.values(req.files).flat().forEach(file => deleteFile(file.path));
        }
        
        const errorMessages = errors.array().map(e => e.msg);
        req.flash('error_msg', errorMessages.join('<br>'));
        return res.redirect(`/cars/${req.params.id}/edit`);
      }

      const car = await Car.findById(req.params.id);
      if (!car) {
        req.flash('error_msg', 'Car not found');
        return res.redirect('/cars');
      }

      const {
        make, model, type, year, color, vin, licensePlate,
        dailyRate, weeklyRate, monthlyRate, minimumRentalDays, depositRequired,
        seats, doors, luggage, engineSize, transmission, fuelType,
        mpgCity, mpgHighway, fuelTankCapacity,
        features, additionalFeatures, description, shortDescription,
        available, removeImages
      } = req.body;

      // Process image removals
      if (removeImages) {
        const imagesToRemove = Array.isArray(removeImages) ? removeImages : [removeImages];
        imagesToRemove.forEach(imgPath => {
          car.galleryImages = car.galleryImages.filter(img => img !== imgPath);
          deleteFile(imgPath);
        });
      }

      // Process new images
      if (req.files) {
        // Update main image if new one was uploaded
        if (req.files.mainImage?.[0]) {
          deleteFile(car.mainImage);
          car.mainImage = req.files.mainImage[0].path.replace('public', '');
        }

        // Add new gallery images
        if (req.files.galleryImages?.length) {
          car.galleryImages = [
            ...car.galleryImages,
            ...req.files.galleryImages.map(file => file.path.replace('public', ''))
          ];
        }
      }

      // Update car properties
      Object.assign(car, {
        make,
        model,
        type,
        year: parseInt(year),
        color,
        vin,
        licensePlate,
        dailyRate: parseFloat(dailyRate),
        weeklyRate: weeklyRate ? parseFloat(weeklyRate) : undefined,
        monthlyRate: monthlyRate ? parseFloat(monthlyRate) : undefined,
        minimumRentalDays: minimumRentalDays ? parseInt(minimumRentalDays) : 1,
        depositRequired: depositRequired ? parseFloat(depositRequired) : 0,
        seats: parseInt(seats),
        doors: parseInt(doors),
        luggage: parseInt(luggage),
        engineSize: engineSize ? parseFloat(engineSize) : undefined,
        transmission,
        fuelType,
        mpgCity: mpgCity ? parseFloat(mpgCity) : undefined,
        mpgHighway: mpgHighway ? parseFloat(mpgHighway) : undefined,
        fuelTankCapacity: fuelTankCapacity ? parseFloat(fuelTankCapacity) : undefined,
        features: processFeatures(features, additionalFeatures),
        additionalFeatures,
        description,
        shortDescription,
        available: available === 'on',
        lastUpdatedBy: req.user._id,
        updatedAt: new Date()
      });

      await car.save();
      req.flash('success_msg', `${make} ${model} updated successfully`);
      res.redirect(`/cars/${car._id}`);
    } catch (err) {
      // Clean up uploaded files if error occurred
      if (req.files) {
        Object.values(req.files).flat().forEach(file => deleteFile(file.path));
      }
      next(err);
    }
  }
);

// Handle car deletion (Admin only)
router.delete('/:id', ensureAuthenticated, ensureAdmin, async (req, res, next) => {
  try {
    if (!validateObjectId(req.params.id)) {
      req.flash('error_msg', 'Invalid car ID');
      return res.redirect('/cars');
    }

    const car = await Car.findByIdAndDelete(req.params.id);
    
    if (!car) {
      req.flash('error_msg', 'Car not found');
      return res.redirect('/cars');
    }

    // Delete associated images
    deleteFile(car.mainImage);
    car.galleryImages.forEach(imgPath => deleteFile(imgPath));

    req.flash('success_msg', `${car.make} ${car.model} deleted successfully`);
    res.redirect('/cars');
  } catch (err) {
    next(err);
  }
});

// Toggle car availability (Admin only)
router.post('/:id/toggle-availability', ensureAuthenticated, ensureAdmin, async (req, res, next) => {
  try {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid car ID' });
    }

    const car = await Car.findById(req.params.id);
    if (!car) {
      return res.status(404).json({ success: false, message: 'Car not found' });
    }

    car.available = !car.available;
    car.lastUpdatedBy = req.user._id;
    await car.save();

    res.json({ 
      success: true, 
      available: car.available,
      message: `Car is now ${car.available ? 'available' : 'unavailable'}`
    });
  } catch (err) {
    next(err);
  }
});

// Error handling middleware for this router
router.use((err, req, res, next) => {
  console.error('Car routes error:', err);
  
  if (req.fileValidationError) {
    req.flash('error_msg', req.fileValidationError);
    return res.redirect(req.originalUrl);
  }

  req.flash('error_msg', 'An error occurred. Please try again.');
  res.redirect('/cars');
});

module.exports = router;